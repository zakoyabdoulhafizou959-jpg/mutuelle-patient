// api/upload.js - Serverless Function Vercel
// ✅ Utilise fetch natif de Node.js 18+ (pas besoin de node-fetch)

// ✅ VOS CLÉS B2 (SECURISÉES - jamais exposées au client)
const B2_KEY_ID = process.env.B2_KEY_ID || '786f70c49f56';
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || '0058a69c72c63bc942bcac0b73dbbfa071419c5e14';
const B2_BUCKET_ID = process.env.B2_BUCKET_ID || 'VOTRE_BUCKET_ID'; // ⚠️ À REMPLACER
const B2_PUBLIC_URL = 'https://f005.backblazeb2.com/file/mutuelle';

// 🔐 Authentifier avec B2
async function authenticateB2() {
    const credentials = Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString('base64');
    
    const response = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
        headers: {
            'Authorization': `Basic ${credentials}`
        }
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`B2 auth failed (${response.status}): ${errorText}`);
    }
    
    return await response.json();
}

// 📤 Handler principal
export default async function handler(req, res) {
    // ✅ CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // ✅ Preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // ✅ Vérifier méthode
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Récupérer le fichier depuis le body (base64)
        const { file, fileName, mimeType } = req.body;
        
        if (!file || !fileName) {
            return res.status(400).json({ error: 'Fichier ou nom de fichier manquant' });
        }
        
        // Vérifier que B2_BUCKET_ID est configuré
        if (!B2_BUCKET_ID || B2_BUCKET_ID === 'VOTRE_BUCKET_ID') {
            return res.status(500).json({ 
                error: 'B2_BUCKET_ID non configuré',
                details: 'Veuillez configurer B2_BUCKET_ID dans les variables d\'environnement Vercel'
            });
        }
        
        // Convertir base64 en buffer
        const fileBuffer = Buffer.from(file, 'base64');
        
        // Vérifier taille (max 5MB)
        if (fileBuffer.length > 5 * 1024 * 1024) {
            return res.status(400).json({ error: 'Fichier trop volumineux (max 5MB)' });
        }
        
        // Authentifier avec B2
        const b2Auth = await authenticateB2();
        
        // ✅ Construire l'URL absolue pour get_upload_url
        const uploadUrlEndpoint = `${b2Auth.apiUrl}/b2api/v2/b2_get_upload_url`;
        
        // Obtenir l'URL d'upload
        const uploadUrlResponse = await fetch(uploadUrlEndpoint, {
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
        
        // ✅ Vérifier que uploadData.uploadUrl est une URL absolue
        if (!uploadData.uploadUrl || !uploadData.uploadUrl.startsWith('http')) {
            throw new Error('URL d\'upload invalide reçue de B2');
        }
        
        // Uploader le fichier
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
        
        // ✅ Retourner l'URL publique
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
            details: 'Erreur lors de l\'upload vers Backblaze B2'
        });
    }
}
