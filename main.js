const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');

let steamworks = null;
let steamClient = null;
let currentSteamCmdProcess = null;
const PZ_APP_ID = 108600;

const getPZBasePath = () => {
    const p = path.join(app.getPath('documents'), 'PZPUBLISHER');
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
};

const getLogsPath = () => {
    const p = path.join(getPZBasePath(), 'Hata_Kayitlari');
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
};

function logError(category, context, err) {
    try {
        const logFile = path.join(getLogsPath(), `${category}.txt`);
        const timestamp = new Date().toLocaleString('tr-TR');
        const msg = typeof err === 'object' ? (err.stack || err.message || JSON.stringify(err)) : err;
        const logEntry = `[${timestamp}] [${context}]\n${msg}\n---------------------------------------\n`;
        fs.appendFileSync(logFile, logEntry);
    } catch (e) { console.error("Log kaydı oluşturulamadı:", e); }
}

let mainWindow;

function initSteam() {
    try {
        if (!steamworks) steamworks = require('steamworks.js');
        if (!steamClient) {
            steamClient = steamworks.init(PZ_APP_ID);
            if (steamClient && steamClient.richPresence) {
                steamClient.richPresence.set('status', 'Project Zomboid in PZPUBLISHER');
            }
            // Arayüze "Çevrimiçi" bilgisini gönder
            if (mainWindow) {
                mainWindow.webContents.send('steam-status', { online: true });
            }
        }
        return true;
    } catch (e) { 
        logError('genel_sistem', "Steam Init", e);
        if (mainWindow) {
            mainWindow.webContents.send('steam-status', { online: false });
        }
        return false; 
    }
}

const getDownloadsPath = () => {
    const p = path.join(getPZBasePath(), 'Downloads');
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
};

function createWindow () {
    mainWindow = new BrowserWindow({
        width: 1050, height: 700, minWidth: 900, minHeight: 600,
        backgroundColor: '#070707', autoHideMenuBar: true,
        icon: path.join(__dirname, 'pzpublisherlogo.png'),
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        show: false
    });
    
    mainWindow.maximize();
    mainWindow.once('ready-to-show', () => { 
        mainWindow.show(); 
        setTimeout(initSteam, 1000); 
    });
    mainWindow.loadFile('index.html');
    mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

ipcMain.on('open-logs-folder', () => {
    shell.openPath(getLogsPath());
});

ipcMain.handle('select-folder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.filePaths.length > 0 ? res.filePaths[0] : null;
});

ipcMain.handle('select-image', async () => {
    const res = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Kapak Resmi', extensions: ['jpg', 'jpeg', 'png'] }]
    });
    if (res.filePaths.length > 0) {
        const imgPath = res.filePaths[0];
        const stats = fs.statSync(imgPath);
        if (stats.size > 1024 * 1024) return { error: "Seçilen görsel boyutu 1 MB'dan büyük olamaz." };
        return { path: imgPath };
    }
    return null;
});

ipcMain.handle('validate-folder', async (e, folderPath) => {
    if (!folderPath || !fs.existsSync(folderPath)) return { valid: false, error: "Klasör dizini bulunamadı." };
    const filesInFolder = fs.readdirSync(folderPath);
    const hasModInfo = filesInFolder.some(f => f.toLowerCase() === 'mod.info');
    if (!hasModInfo) {
        return { valid: false, error: "Seçilen dizinde 'mod.info' dosyası tespit edilemedi." };
    }
    return { valid: true };
});

ipcMain.handle('clear-cache', async () => {
    const basePath = getPZBasePath();
    try {
        if (fs.existsSync(path.join(basePath, 'Temp'))) fs.rmSync(path.join(basePath, 'Temp'), { recursive: true, force: true });
        return { success: true };
    } catch(e) { 
        logError('ayarlar', "Clear Cache", e);
        return { success: false }; 
    }
});

ipcMain.handle('steam-login', async () => {
    return new Promise((resolve) => {
        const port = 3000;
        const params = new URLSearchParams({ 'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'checkid_setup', 'openid.return_to': `http://localhost:${port}/auth`, 'openid.realm': `http://localhost:${port}`, 'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select', 'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select' });
        const server = http.createServer(async (req, res) => {
            if (req.url.startsWith('/auth')) {
                const claimedId = new URL(req.url, `http://localhost:${port}`).searchParams.get('openid.claimed_id');
                if (claimedId) {
                    const steamId = claimedId.split('/').pop();
                    try {
                        const xml = await (await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`)).text();
                        const nameMatch = xml.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/), avatarMatch = xml.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/);
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(`<body style="background:#070707;color:#00ff9d;text-align:center;padding-top:100px;"><h2>Giris Islemi Basarili.</h2></body>`);
                        server.close(); resolve({ success: true, steamId, name: nameMatch ? nameMatch[1] : "", avatar: avatarMatch ? avatarMatch[1] : "default_cover.jpg" });
                    } catch (err) { 
                        logError('ayarlar', "Steam Login Parse", err);
                        res.writeHead(500); res.end(''); server.close(); resolve({ success: false }); 
                    }
                } else { res.writeHead(400); res.end(''); server.close(); resolve({ success: false }); }
            }
        });
        server.listen(port, () => shell.openExternal(`https://steamcommunity.com/openid/login?${params.toString()}`));
    });
});

ipcMain.handle('fetch-mod-info', async (e, url) => {
    try {
        const mainIdMatch = url.match(/id=(\d+)/);
        if (!mainIdMatch) return { success: false, error: "Bağlantı adresi geçersiz." };
        const mainId = mainIdMatch[1];
        
        const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `itemcount=1&publishedfileids[0]=${mainId}`
        });
        const data = await response.json();
        
        let title = "Bilinmeyen Mod";
        let imageUrl = "default_cover.jpg";
        let fileSize = "0 MB";

        if (data.response.result === 1 && data.response.publishedfiledetails.length > 0) {
            const info = data.response.publishedfiledetails[0];
            title = info.title || title;
            imageUrl = info.preview_url || imageUrl;
            if (info.file_size) fileSize = (info.file_size / (1024 * 1024)).toFixed(2) + " MB";
        }

        return { 
            success: true, title: title, imageUrl: imageUrl, 
            ids: [mainId], mainId: mainId, 
            isCollection: false, fileSize: fileSize 
        };
    } catch (err) { 
        logError('indirici', "Fetch Mod Info", err);
        return { success: false, error: "Sunucu bağlantısı sağlanamadı." }; 
    }
});

ipcMain.handle('start-download', async (e, idsToDownload, mainId, isCollection, customDownloadPath) => {
  return new Promise((resolve) => {
      const basePath = getPZBasePath();
      const tempDir = path.join(basePath, 'Temp');
      const baseDownloadFolder = (customDownloadPath && fs.existsSync(customDownloadPath)) ? customDownloadPath : getDownloadsPath();
      const finalDir = path.join(baseDownloadFolder, `Mod_${mainId}`);
      
      const args = ['+force_install_dir', tempDir, '+login', 'anonymous', '+workshop_download_item', PZ_APP_ID.toString(), mainId, '+quit'];
      
      currentSteamCmdProcess = spawn(path.join(__dirname, 'tools', 'steamcmd.exe'), args);
      let logOutput = "";
      currentSteamCmdProcess.stdout.on('data', (d) => { logOutput += d.toString(); e.sender.send('download-progress', d.toString()); });
      currentSteamCmdProcess.on('close', async (code) => {
        currentSteamCmdProcess = null; if (code === null) return resolve({ success: false, cancelled: true });
        try {
            const dPath = path.join(tempDir, 'steamapps', 'workshop', 'content', PZ_APP_ID.toString(), mainId);
            if (fs.existsSync(dPath)) {
                if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
                fs.cpSync(dPath, finalDir, { recursive: true });
                resolve({ success: true, path: finalDir });
            } else {
                resolve({ success: false, error: "İndirme tamamlanamadı." });
            }
        } catch (ex) { 
            logError('indirici', "Downloader Exception", ex);
            resolve({ success: false, error: "Kritik hata oluştu." }); 
        }
      });
  });
});

ipcMain.on('cancel-download', () => { if (currentSteamCmdProcess) currentSteamCmdProcess.kill(); });
ipcMain.on('open-folder', (e, p) => shell.openPath(p));

// KURULU MODLAR FONKSİYONU - HİÇBİR SATIR EKSİLTİLMEDİ
ipcMain.handle('get-installed-mods', async (e, customPath) => {
    try {
        let pzPath = customPath;
        if (!pzPath) {
            const drives = ['C', 'D', 'E', 'F', 'G'];
            for (let drive of drives) {
                let testPath1 = path.join(`${drive}:\\`, 'SteamLibrary', 'steamapps', 'common', 'ProjectZomboid');
                let testPath2 = path.join(`${drive}:\\`, 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'ProjectZomboid');
                if (fs.existsSync(testPath1)) { pzPath = testPath1; break; }
                if (fs.existsSync(testPath2)) { pzPath = testPath2; break; }
            }
        }
        
        let localMods = [];
        let workshopMods = [];

        // Yerel modlar (Kullanıcı klasörü)
        const localAddonsPath = path.join(os.homedir(), 'Zomboid', 'mods');
        if (fs.existsSync(localAddonsPath)) {
            const dirs = fs.readdirSync(localAddonsPath, { withFileTypes: true });
            dirs.forEach(dirent => { if (dirent.isDirectory()) localMods.push({ filename: dirent.name }); });
        }

        // Atölye modları (SteamApps/workshop/content/108600)
        if (pzPath) {
            // Oyun dizininden workshop klasörüne çıkıyoruz
            const wsPath = path.resolve(pzPath, '..', '..', 'workshop', 'content', PZ_APP_ID.toString());
            if (fs.existsSync(wsPath)) {
                const dirs = fs.readdirSync(wsPath, { withFileTypes: true });
                dirs.forEach(dirent => { if (dirent.isDirectory() && !isNaN(dirent.name)) workshopMods.push({ id: dirent.name }); });
            }
        }
        return { success: true, foundPath: pzPath || "", localMods: localMods, workshopMods: workshopMods };
    } catch (error) { 
        logError('kurulu_eklentiler', "Get Installed Mods", error);
        return { success: false, error: "Tarama hatası." }; 
    }
});

ipcMain.handle('fetch-detailed-mod-info', async (e, id) => {
    try {
        const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `itemcount=1&publishedfileids[0]=${id}`
        });
        const data = await response.json();
        if (data.response.result === 1 && data.response.publishedfiledetails.length > 0) {
            const info = data.response.publishedfiledetails[0];
            const up = info.upvotes || 0; const total = up + (info.downvotes || 0);
            return {
                success: true, title: info.title || id,
                imageUrl: info.preview_url || 'default_cover.jpg',
                author: info.creator || 'Geliştirici', 
                subs: info.lifetime_subscriptions ? info.lifetime_subscriptions.toString() : '0',
                fileSize: info.file_size ? (info.file_size / 1048576).toFixed(2) + ' MB' : '0 MB',
                stars: total > 0 ? Math.round((up / total) * 5).toString() : "3",
                desc: info.description || "Açıklama yok."
            };
        }
        return { success: false };
    } catch (error) { return { success: false }; }
});

ipcMain.handle('fetch-my-mods', async (e, steamId) => {
    try {
        const url = `https://steamcommunity.com/profiles/${steamId}/myworkshopfiles/?appid=${PZ_APP_ID}`;
        const response = await fetch(url);
        const html = await response.text();
        let ids = [];
        const regex = /sharedfiles\/filedetails\/\?id=(\d+)/g;
        let match;
        while ((match = regex.exec(html)) !== null) { ids.push(match[1]); }
        return { success: true, ids: [...new Set(ids)] };
    } catch (error) { return { success: false, error: "Hata oluştu." }; }
});

ipcMain.handle('upload-to-workshop', async (e, modData) => {
    try {
        if (!steamClient && !initSteam()) return { success: false, error: "Steam Bağlanamadı!" };
        const item = await steamClient.workshop.createItem(PZ_APP_ID);
        if (item.needsToAcceptAgreement) return { success: false, error: "Sözleşme kabul edilmeli." };

        const updateData = {
            title: modData.title || "PZ Mod",
            description: modData.desc || "PZPublisher ile yüklendi.",
            visibility: Number(modData.visibility || 0),
            contentPath: path.resolve(modData.folderPath),
            tags: [modData.type || "Map"]
        };
        if (modData.previewImg) updateData.previewPath = path.resolve(modData.previewImg);
        else updateData.previewPath = path.resolve(path.join(__dirname, 'default_cover.jpg'));

        await steamClient.workshop.updateItem(item.itemId, updateData);
        return { success: true, itemId: item.itemId.toString() };
    } catch(err) { return { success: false, error: err.message }; }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });