// api/upload.js - Serverless Function Vercel
const fetch = require('node-fetch');

// ✅ VOS CLÉS B2 (SECURISÉES - jamais exposées au client)
const B2_KEY_ID = process.env.B2_KEY_ID || '786f70c49f56';
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || '0058a69c72c63bc942bcac0b73dbbfa071419c5e14';
const B2_BUCKET_ID = process.env.B2_BUCKET_ID || 'VOTRE_BUCKET_ID'; // À remplacer
const B2_PUBLIC_URL = 'https://f005.backblazeb2.com/file/mutuelle';

// 🔐 Authentifier avec B2
async function authenticateB2() {
    const credentials = Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString('base64');
    
    const response = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
        headers: { 'Authorization': `Basic ${credentials}` }
    });
    
    if (!response.ok) {
        throw new Error('B2 auth failed: ' + response.statusText);
    }
    
    return await response.json();
}

// 📤 Handler principal
module.exports = async (req, res) => {
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
            return res.status(400).json({ error: 'Fichier manquant' });
        }
        
        // Convertir base64 en buffer
        const fileBuffer = Buffer.from(file, 'base64');
        
        // Vérifier taille (max 5MB)
        if (fileBuffer.length > 5 * 1024 * 1024) {
            return res.status(400).json({ error: 'Fichier trop volumineux (max 5MB)' });
        }
        
        // Authentifier avec B2
        const b2Auth = await authenticateB2();
        
        // Obtenir l'URL d'upload
        const uploadUrlResponse = await fetch(`${b2Auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
            method: 'POST',
            headers: {
                'Authorization': b2Auth.authorizationToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bucketId: B2_BUCKET_ID })
        });
        
        const uploadData = await uploadUrlResponse.json();
        
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
            throw new Error('Upload B2 failed: ' + uploadResponse.statusText);
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
        console.error('Erreur upload:', error);
        return res.status(500).json({ 
            error: error.message,
            details: 'Erreur lors de l\'upload'
        });
    }
};
