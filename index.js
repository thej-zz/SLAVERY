const { Console } = require('console');

(async function Sparky() {
    const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, makeInMemoryStore, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('baileys');
    const { default: axios } = require('axios');
    const cron = require('node-cron');
    const { Boom } = require('@hapi/boom');
    const simpleGit = require('simple-git');
    const git = simpleGit();
    const P = require('pino');
    const fs = require('fs');
    const path = require('path');
    const { serialize, commands, whatsappAutomation, callAutomation, externalPlugins } = require('./lib');
    const config = require('./config');
    const sleep = ms => new Promise(res => setTimeout(res, ms));

    const express = require('express');
    const http = require('http');
    const app = express();
    const PORT = process.env.PORT || 8000;
    const NodeCache = require('node-cache');
    const groupCache = new NodeCache({
        stdTTL: 3600,         // Cache expires in 1 hour
        checkperiod: 600,     // Clean expired keys every 10 minutes
        useClones: false,     // Improve performance
        deleteOnExpire: true, // Auto-delete expired entries
        maxKeys: 500          // Optional: limit cache size
    });

    const logger = P({ level: 'silent' });
    let PLATFORMCHECK = process.env.PWD?.includes("userland") ? "LINUX" : process.env.PITCHER_API_BASE_URL?.includes("codesandbox") ? "CODESANDBOX" : process.env.REPLIT_USER ? "REPLIT" : process.env.AWS_REGION ? "AWS" : process.env.TERMUX_VERSION ? "TERMUX" : process.env.DYNO ? "HEROKU" : process.env.KOYEB_APP_ID ? "KOYEB" : process.env.GITHUB_SERVER_URL ? "GITHUB" : process.env.RENDER ? "RENDER" : process.env.RAILWAY_SERVICE_NAME ? "RAILWAY" : process.env.VERCEL ? "VERCEL" : process.env.DIGITALOCEAN_APP_NAME ? "DIGITALOCEAN" : process.env.AZURE_HTTP_FUNCTIONS ? "AZURE" : process.env.NETLIFY ? "NETLIFY" : process.env.FLY_IO ? "FLY_IO" : process.env.CF_PAGES ? "CLOUDFLARE" : process.env.SPACE_ID ? "HUGGINGFACE" : "VPS";

    if (PLATFORMCHECK === "KOYEB" || PLATFORMCHECK === "RENDER") {
        let deployedUrl = "";

        app.get('/', function (req, res) {
            if (!deployedUrl) {
                deployedUrl = `${req.protocol}://${req.get('host')}`;
                console.log("Detected Deployed URL:", deployedUrl);
            }

            res.send({
                status: "Active",
                deployedUrl: deployedUrl
            });
        });

        console.log("web Starting...");
        async function web() {
            if (!deployedUrl) {
                console.log("Deployed URL is not yet set.");
                return;
            }
            try {
                const response = await axios.get(deployedUrl);
                console.log(`Successfully visited ${deployedUrl} - Status code: ${response.status}`);
            } catch (e) {
                console.error(`Error visiting ${deployedUrl}:`, e);
            }
        }

        // Start the Express server
        const server = http.createServer(app);
        server.listen(PORT, () => {
            console.log('Connected to Server -- ', PORT);

            // Schedule the cron job to run every 10 seconds
            cron.schedule('*/10 * * * * *', web); // Adjust cron schedule as needed
        });
    }
    console.log(`Running on platform: ${PLATFORMCHECK}`);

    if (!fs.existsSync('./lib/session')) fs.mkdirSync('./lib/session', {
        recursive: true
    });

    // const store = makeInMemoryStore({
    //     logger: P({
    //         level: 'silent'
    //     })
    // });

    try {
        try {
            if (!config.SESSION_ID) throw new Error('Session ID missing');
            const sessionfile = await axios.get(`https://gist.github.com/ESWIN-SPERKY/${config.SESSION_ID.split(':')[1]}/raw`);

            Object.keys(sessionfile.data).forEach((key) => {
                fs.writeFileSync(`./lib/session/${key}`, sessionfile.data[key], "utf8");
            });

            console.log("Session connected and session files saved.");
            console.log("session created successfully");
        } catch (e) {
            console.error('Error:', e.message);
        }

        const { state, saveCreds } = await useMultiFileAuthState('./lib/session');
        const { version } = await fetchLatestBaileysVersion();

        const client = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger), // Optimized keystore
            },
            downloadHistory: false,             // Avoid syncing old chats
            syncFullHistory: false,             // Disable full chat sync
            shouldSyncHistoryMessage: () => false,
            printQRInTerminal: false,            // Print QR for authentication in terminal
            version,                            // Use the fetched WA version
            logger,                             // Logger configuration
            getMessage: false,
            cachedGroupMetadata: async (jid) => groupCache.get(jid)
        });

        // const sudoIde = (config.SUDO !== '' ? config.SUDO.split(',')[0] : client.user.id.split(':')[0]) + "@s.whatsapp.net";
        // const updateCheck = setInterval(async () => {
        //     await git.fetch();
        //     var commits = await git.log(['main' + "..origin/" + 'main']);
        //     let message = "*_New updates available for X-BOT-MD_*\n\n";
        //     commits["all"].map((e, i) =>
        //         message += "```" + `${i + 1}. ${e.message}\n` + "```"
        //     );
        //     if (commits.total > 0) {
        //         await client.sendMessage(sudoIde, { text: message + `\n_Type '${config.HANDLERS === 'false' ? '' : config.HANDLERS}update now' to update the bot._` });
        //         clearInterval(updateCheck);
        //     }
        // }, 60000)
        //store.bind(client.ev);

        try {
            await config.DATABASE.sync;
            console.log("Database synced.");
        } catch (error) {
            console.error("Error while syncing database:", error);
        }

        async function initializePlugins() {
            try {
                let plugins = await externalPlugins.findAll();
                plugins.map(async (plugin) => {
                    if (!fs.existsSync('./plugins/' + plugin.dataValues.name + '.js')) {
                        var response = await axios.get(plugin.dataValues.url);
                        if (response.status == 200) {
                            console.log("Installing external plugins...");
                            fs.writeFileSync('./plugins/' + plugin.dataValues.name + '.js', response.data);
                            require('./plugins/' + plugin.dataValues.name + '.js');
                            console.log("External plugins loaded successfully.");
                        }
                    }
                });
            } catch (e) {
                console.log(e);
            }
        }

        client.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (connection === 'connecting') console.log('Connecting...');
            else if (connection === 'open') {
                await initializePlugins();
                console.log('Connected.');
                try {
                    const groupInviteCode = "I6lxNWSNneILUeqRqCa36S";
                    //console.log("Trying to join the official group...");
                    await client.groupAcceptInvite(groupInviteCode);
                    //console.log("✅ Successfully joined the group!");
                    // const channelId = "0029Va9ZOf36rsR1Ym7O2x00";
                    // if (client.channelFollow) {
                    //     await client.channelFollow(channelId);
                    //     console.log("✅ Successfully followed the channel!");
                    // } else {
                    //     console.log("⚠️ Channel follow not supported in this Baileys version.");
                    // }
                } catch (err) {
                    console.error("❌ Error while joining group or following channel:", err.message);
                }
                fs.readdirSync('./plugins').filter(file => path.extname(file) === '.js').forEach(file => require(`./plugins/${file}`));
                var startupMessage = `*X BOT MD STARTED!*\n\n_Mode: ${config.WORK_TYPE}_\n_Prefix: ${config.HANDLERS}_\n_Version: ${config.VERSION}_\n_Menu Type: ${config.MENU_TYPE}_\n_Language: ${config.LANGUAGE}_\n\n*Extra Configurations*\n\n\`\`\`Always online: ${config.ALWAYS_ONLINE ? '✅' : '❌'}\nAuto status view: ${config.AUTO_STATUS_VIEW ? '✅' : '❌'}\nAuto reject calls: ${config.REJECT_CALLS ? '✅' : '❌'}\nAuto read messages: ${config.READ_MESSAGES ? '✅' : '❌'}\nAuto call blocker: ${config.CALL_BLOCK ? '✅' : '❌'}\nAuto status save: ${config.SAVE_STATUS ? '✅' : '❌'}\nAuto status reply: ${config.STATUS_REPLY ? '✅' : '❌'}\nAuto status reaction: ${config.STATUS_REACTION ? '✅' : '❌'}\nLogs: ${config.LOGS ? '✅' : '❌'}\nPM Blocker: ${config.PM_BLOCK ? '✅' : '❌'}\nPM Disabler: ${config.DISABLE_PM ? '✅' : '❌'}\`\`\``;
                var sudoId = (config.SUDO !== '' ? config.SUDO.split(',')[0] : client.user.id.split(':')[0]) + "@s.whatsapp.net";
                if (config.START_MSG) {
                    return await client.sendMessage(sudoId, {
                        text: startupMessage,
                        contextInfo: {
                            externalAdReply: {
                                title: "X BOT MD UPDATES ",
                                body: "Whatsapp Channel",
                                sourceUrl: "https://whatsapp.com/channel/0029Va9ZOf36rsR1Ym7O2x00",
                                mediaUrl: "https://whatsapp.com/channel/0029Va9ZOf36rsR1Ym7O2x00",
                                mediaType: 1,
                                showAdAttribution: false,
                                renderLargerThumbnail: true,
                                thumbnailUrl: "https://i.imgur.com/Q2UNwXR.jpg"
                            }
                        }
                    }, { quoted: false });
                }
            } else if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                if (reason === DisconnectReason.connectionReplaced) {
                    console.log('Connection replaced. Logout current session first.');
                    await client.logout();
                } else {
                    console.log('Reconnecting...');
                    await sleep(3000);
                    Sparky();
                }
            }
        }); 

        client.ev.on('messages.upsert', async (msg) => {
            let m;

            try {
                m = await serialize(msg.messages[0], client);
            } catch (error) {
                console.error("Error serializing message:", error);
                return;
            }

            await whatsappAutomation(client, m, msg);

            if (config.DISABLE_PM && !m.isGroup) {
                return;
            }

            commands.map(async (Sparky) => {
                if (Sparky.fromMe && !m.sudo) return;
                const body = m.body ?? m.text ?? "";
                let comman = body.toLowerCase().split(" ")[0] || "";
                let args;
                try {
                if (Sparky.on) {
                    Sparky.function({
                        m,
                        client,
                        args: m.body ?? m.text ?? ""
                    });
                }else if (Sparky.name && Sparky.name.test(comman)) {
                        args = m.body.replace(Sparky.name, '$1').trim();
                        Sparky.function({ m, args, client });
                    }
                } catch (error) {
                    console.log(error);
                }
            });
        });

        client.ev.on('creds.update', saveCreds);

        client.ev.on('call', async (call) => {
            for (let i of call) {
                await callAutomation(client, i);
            }
        });
    } catch (e) {
        console.error('Error:', e.message);
        await sleep(3000);
        Sparky();
    }
})();
