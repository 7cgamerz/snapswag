const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// 🔥 FIXED CORS MIDDLEWARE (Allows Netlify connections without blocking)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Vercel-compatible temporary directory for serverless environments
const downloadDir = '/tmp'; 

// Standard global binary execution for cloud environments
const ytDlpPath = "yt-dlp";

// Test route to verify server status
app.get('/', (req, res) => {
    res.json({ status: "MegaDownloader API is fully operational on Vercel!" });
});

// 🔍 1. ENDPOINT: Fetch Metadata Configuration
app.post('/api/fetch-info', (req, res) => {
    const { videoUrl } = req.body;
    if (!videoUrl) return res.status(400).json({ error: 'URL field is required!' });

    const command = `${ytDlpPath} --no-warnings --dump-json "${videoUrl}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(stderr);
            return res.status(500).json({ error: 'Could not fetch asset details. Link might be private or restricted.' });
        }

        try {
            const metadata = JSON.parse(stdout);
            res.json({
                title: metadata.title || 'Social Media Asset',
                thumbnail: metadata.thumbnail || (metadata.thumbnails && metadata.thumbnails[0]?.url) || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500',
                duration: metadata.duration_string || (metadata.duration ? `${metadata.duration}s` : 'Post'),
                url: videoUrl
            });
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse metadata payload.' });
        }
    });
});

// 📥 2. ENDPOINT: Stream Media Extraction Process
app.post('/api/download', (req, res) => {
    const { videoUrl, format } = req.body;
    const timestamp = Date.now();
    
    // Storing files directly into the permitted serverless /tmp stream space
    const outputTemplate = path.join(downloadDir, `${timestamp}_%(title)s.%(ext)s`);

    let ytDlpCommand = '';
    const isInstagramPhoto = videoUrl.includes('instagram.com/p/');

    if (isInstagramPhoto) {
        ytDlpCommand = `${ytDlpPath} --no-warnings --no-playlist "${videoUrl}" -o "${outputTemplate}"`;
    } else {
        if (format === 'mp3') {
            ytDlpCommand = `${ytDlpPath} -x --audio-format mp3 --audio-quality 0 --no-warnings "${videoUrl}" -o "${outputTemplate}"`;
        } else if (format === '1080p') {
            ytDlpCommand = `${ytDlpPath} -f "bestvideo[height<=1080]+bestaudio/best" --merge-output-format mp4 --no-warnings "${videoUrl}" -o "${outputTemplate}"`;
        } else {
            ytDlpCommand = `${ytDlpPath} -f "best[ext=mp4]/best" --no-warnings "${videoUrl}" -o "${outputTemplate}"`;
        }
    }

    exec(ytDlpCommand, (error, stdout, stderr) => {
        const files = fs.readdirSync(downloadDir);
        const downloadedFile = files.find(file => file.startsWith(timestamp.toString()));
        
        if (!downloadedFile) {
            console.error("Core Engine Logs:", stderr || error);
            return res.status(500).json({ error: 'Asset extraction failed or timeout triggered.' });
        }

        const filePath = path.join(downloadDir, downloadedFile);
        
        res.download(filePath, downloadedFile, (err) => {
            try {
                fs.unlinkSync(filePath);
            } catch (unlinkErr) {
                console.error('Cleanup notice:', unlinkErr);
            }
        });
    });
});

module.exports = app;
