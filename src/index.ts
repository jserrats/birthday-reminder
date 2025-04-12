

import 'dotenv/config'
import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import fs from 'fs';
import axios, { AxiosInstance } from 'axios';
import cron from 'node-cron';

console.log("[i] Starting Birthday reminder")

// Configuration for OAuth2
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}`;
const TOKEN_PATH = './token.json';

// These scopes should be adjusted based on your specific needs
const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly'
];

// Initialize OAuth2 client - replace with your own credentials
const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET

/**
 * Create an OAuth2 client
 */
function createOAuth2Client() {
    return new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
    );
}

/**
 * Get a URL for user authorization
 */
function getAuthorizationUrl(oauth2Client: any) {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });

    return authUrl;
}

/**
 * Start a local web server to handle the OAuth2 callback
 */
function startWebServer(oauth2Client: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                if (!req.url || !req.url.includes('code=')) {
                    res.end('No authorization code found in the request');
                    return;
                }

                const qs = new url.URL(req.url, REDIRECT_URI).searchParams;
                const code = qs.get('code');

                if (!code) {
                    res.end('No valid authorization code found in the request');
                    return;
                }

                res.end('Authentication successful! You can close this window.');
                server.close();

                // Exchange the authorization code for tokens
                const { tokens } = await oauth2Client.getToken(code);
                oauth2Client.setCredentials(tokens);

                // Save the tokens to a file for future use
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
                console.log('Tokens saved to', TOKEN_PATH);

                resolve(oauth2Client);
            } catch (e) {
                reject(e);
            }
        }).listen(PORT, () => {
            console.log(`Listening on port ${PORT}...`);
        });
    });
}

/**
 * Main function to run the OAuth2 flow
 */
async function runOAuth2Flow() {
    const oauth2Client = createOAuth2Client();

    // Check if we have previously stored token
    try {
        let token =  process.env.GOOGLE_TOKEN as string
        if (!token) {
            token = fs.readFileSync(TOKEN_PATH, 'utf-8');
        }
        oauth2Client.setCredentials(JSON.parse(token));
        console.log('Using saved tokens from', TOKEN_PATH);
        return oauth2Client;
    } catch (error) {
        // No tokens found, need to get new ones
        const authUrl = getAuthorizationUrl(oauth2Client);

        // Print the URL for the user to visit
        console.log('Authorize this app by visiting this URL:', authUrl);

        // Start web server to handle the redirect
        return startWebServer(oauth2Client);
    }
}

function formatBirthdayDate(dateString: string): string {
    const date = new Date(dateString);
    const month = date.getMonth() + 1; // getMonth() returns 0-11
    const day = date.getDate();
    return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`;
}

/**
 * Example usage of the authenticated client
 */
async function main() {

    const auth = await runOAuth2Flow();
    const calendar = google.calendar({ version: 'v3', auth: auth });
    try {
        try {

            const timeMin = new Date();
            const timeMax = new Date();
            timeMax.setDate(timeMax.getDate() + 1);

            const primaryResponse = await calendar.events.list({
                calendarId: 'primary',
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const primaryEvents = primaryResponse.data.items || [];
            const birthdayEventsInPrimary = primaryEvents.filter(event =>
                (event.summary && event.summary.toLowerCase().includes('birthday')) ||
                (event.description && event.description.toLowerCase().includes('birthday')) ||
                (event.extendedProperties?.private?.type === 'birthday')
            );

            if (birthdayEventsInPrimary.length > 0) {
                console.log(`\n=== Additional Birthday Events in Primary Calendar (${birthdayEventsInPrimary.length} found) ===`);

                // Print birthdays
                birthdayEventsInPrimary.forEach(event => {
                    const startDate = event.start?.date || event.start?.dateTime;
                    if (startDate && event.summary) {
                        const formattedDate = formatBirthdayDate(startDate);
                        sendMessage(`${formattedDate} - ${event.summary}`);
                    }
                });
            } else {
                console.log('No additional birthday events found in primary calendar.');
            }
        } catch (error) {
            sendMessage('Error fetching from primary calendar:' + error);
        }

    } catch (error) {
        sendMessage('Error during authentication:' + error);
    }
}

function sendMessage(message: string) {

    const recipientID = process.env.TELEGRAM_ADMIN_ID;

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (TELEGRAM_BOT_TOKEN === undefined || recipientID === undefined) {
        throw new Error("[!] Missing TELEGRAM_BOT_TOKEN")
    }


    const instance = axios.create({
        baseURL: 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN,
        timeout: 1000,
    });

    instance.post('/sendMessage', {
        chat_id: recipientID,
        text: message,
        //parse_mode: "MarkdownV2"
    }).catch((error) => {
        console.error('Error sending message:', error);
    })

    console.log('Message sent:', message);

}

cron.schedule('0 7 * * *', () => {
    main();
});
