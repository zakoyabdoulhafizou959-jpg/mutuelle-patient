// api/upload.js - Version de test avec Bucket ID en dur

// ✅ CLÉS B2
const B2_KEY_ID = '786f70c49f56';
const B2_APPLICATION_KEY = '0058a69c72c63bc942bcac0b73dbbfa071419c5e14';
const B2_BUCKET_ID = '573866cff7c00c2499ff0516'; // ✅ Bucket ID en dur
const B2_PUBLIC_URL = 'https://f005.backblazeb2.com/file/mutuelle';

async function authenticateB2() {
    const credentials = Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString('base64');
    
    const response = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
        headers: { 'Authorization': `Basic ${credentials}` }
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`B2 auth failed (${response.status}): ${errorText}`);
    }
    
    return await response.json();
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // ✅ Endpoint de TEST pour vérifier la config
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'ok',
            bucketId: B2_BUCKET_ID,
            bucketIdLength: B2_BUCKET_ID.length,
            publicUrl: B2_PUBLIC_URL,
            timestamp: new Date().toISOString()
        });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { file, fileName, mimeType } = req.body;
        
        if (!file || !fileName) {
            return res.status(400).json({ error: 'Fichier ou nom manquant' });
        }
        
        const fileBuffer = Buffer.from(file, 'base64');
        
        if (fileBuffer.length > 5 * 1024 * 1024) {
            return res.status(400).json({ error: 'Fichier trop volumineux (max 5MB)' });
        }
        
        // Auth B2
        const b2Auth = await authenticateB2();
        
        // Obtenir URL d'upload
        const uploadUrlResponse = await fetch(`${b2Auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
            method: 'POST',
            headers: {
                'Authorization': b2Auth.authorizationToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bucketId: B2_BUCKET_ID })
        });
        
        if (!uploadUrlResponse.ok) {
            const errorText = await uploadUrlResponse.text();
            throw new Error(`Get upload URL failed (${uploadUrlResponse.status}): ${errorText}`);
        }
        
        const uploadData = await uploadUrlResponse.json();
        
        // Upload du fichier
        const uploadResponse = await fetch(uploadData.uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': uploadData.authorizationToken,
                'X-Bz-File-Name': encodeURIComponent(fileName),
                'Content-Type': mimeType || 'image/jpeg',
                'X-Bz-Content-Sha1': 'do_not_verify'
            },
            body: fileBuffer
        });
        
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Upload B2 failed (${uploadResponse.status}): ${errorText}`);
        }
        
        const result = await uploadResponse.json();
        const publicUrl = `${B2_PUBLIC_URL}/${encodeURIComponent(fileName)}`;
        
        return res.status(200).json({
            success: true,
            url: publicUrl,
            fileId: result.fileId
        });
        
    } catch (error) {
        console.error('❌ Erreur upload:', error);
        return res.status(500).json({ 
            error: error.message,
            bucketId: B2_BUCKET_ID,
            bucketIdLength: B2_BUCKET_ID.length
        });
    }
}
