const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Ensure downloads directory exists
const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir);
}

// Local path for executable tools
const ytDlpPath = `"C:\\AUniversalTools\\yt-dlp.exe"`;

// 🔍 1. ENDPOINT: Fetch Metadata (Title, Thumbnail, Duration)
app.post('/api/fetch-info', (req, res) => {
    const { videoUrl } = req.body;
    if (!videoUrl) return res.status(400).json({ error: 'URL is required!' });

    const command = `${ytDlpPath} --no-warnings --dump-json "${videoUrl}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(stderr);
            return res.status(500).json({ error: 'Could not fetch details. Please verify the URL or try another public link.' });
        }

        try {
            const metadata = JSON.parse(stdout);
            res.json({
                title: metadata.title || 'Social Media Post',
                thumbnail: metadata.thumbnail || (metadata.thumbnails && metadata.thumbnails[0]?.url) || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500',
                duration: metadata.duration_string || (metadata.duration ? `${metadata.duration}s` : 'Post'),
                url: videoUrl
            });
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse metadata.' });
        }
    });
});

// 📥 2. ENDPOINT: Processing Media File Download
app.post('/api/download', (req, res) => {
    const { videoUrl, format } = req.body;
    const timestamp = Date.now();
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

    console.log(`Executing command: ${ytDlpCommand}`);

    exec(ytDlpCommand, (error, stdout, stderr) => {
        const files = fs.readdirSync(downloadDir);
        const downloadedFile = files.find(file => file.startsWith(timestamp.toString()));
        
        if (!downloadedFile) {
            console.error("System Error Details:", stderr || error);
            return res.status(500).json({ error: 'This post is either private, restricted, or temporary blocked. Try a different public link.' });
        }

        const filePath = path.join(downloadDir, downloadedFile);
        
        res.download(filePath, downloadedFile, (err) => {
            if (err) console.error('Delivery error:', err);
            try {
                fs.unlinkSync(filePath);
                console.log('Storage successfully cleared.');
            } catch (unlinkErr) {
                console.error('Auto-cleanup failed:', unlinkErr);
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`Backend server successfully running on http://localhost:${PORT}`);
});