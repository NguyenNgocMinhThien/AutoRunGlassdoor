import axios from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"];

// --- HÀM GỬI MS TEAMS ---
async function sendToTeams(totalJobs, fileLink) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (!webhookUrl) return;

    const adaptiveCard = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    { "type": "TextBlock", "text": "🚀 CẬP NHẬT JOB MỚI TẠI VANCOUVER", "weight": "Bolder", "size": "Medium", "color": "Accent" },
                    {
                        "type": "FactSet",
                        "facts": [
                            { "title": "Nguồn:", "value": "Glassdoor Canada" },
                            { "title": "Số lượng:", "value": `${totalJobs} jobs` },
                            { "title": "Ngày quét:", "value": new Date().toLocaleDateString() }
                        ]
                    }
                ],
                "actions": [
                    { "type": "Action.OpenUrl", "title": "📥 TẢI FILE EXCEL", "url": fileLink }
                ],
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
            }
        }]
    };

    try {
        await axios.post(webhookUrl, adaptiveCard);
        console.log("✅ [Teams] Đã gửi card thành công!");
    } catch (error) {
        console.error("❌ [Teams] Lỗi gửi:", error.message);
    }
}

// --- HÀM UPLOAD CATBOX ---
async function uploadToCatbox(filePath) {
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('time', '24h');
        form.append('fileToUpload', fs.createReadStream(filePath));
        const response = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', form, {
            headers: form.getHeaders()
        });
        return response.data.trim();
    } catch (error) { return ""; }
}

async function sendTelegramAlert(message) {
    try { await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, { chat_id: process.env.TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }); } catch (e) { }
}

async function sendTelegramFile(filePath) {
    const form = new FormData();
    form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
    form.append('document', fs.createReadStream(filePath));
    try { await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendDocument`, form, { headers: form.getHeaders() }); } catch (e) { }
}

// --- HÀM CHẠY CHÍNH ---
async function runScraper() {
    console.log("🚀 Bắt đầu quét Vancouver, BC, CANADA...");
    let allJobs = [];
    const currentDate = new Date().toISOString().split('T')[0];

    for (const kw of KEYWORDS) {
        // URL CHUẨN CHO VANCOUVER, BC (IC2278757)
        const targetUrl = `https://www.glassdoor.ca/Job/vancouver-bc-jobs-SRCH_IL.0,12_IC2278757.htm?sc.keyword=${encodeURIComponent(kw)}&fromAge=3`;
        
        let attempts = 0;
        while (attempts < 3) {
            try {
                attempts++;
                console.log(`🔍 Quét: ${kw} (Lần ${attempts})...`);

                const response = await axios.get('http://api.scraperapi.com', {
                    params: {
                        api_key: process.env.SCRAPER_API_KEY,
                        url: targetUrl,
                        premium: 'true', 
                        render: 'true', // Bật render để lấy được đầy đủ thẻ location mới
                        country_code: 'us' // IP Mỹ ổn định hơn để quét trang .ca
                    },
                    timeout: 90000
                });

                const $ = cheerio.load(response.data);
                let countBefore = allJobs.length;
                
                $('li[data-test="jobListing"]').each((i, el) => {
                    const titleEl = $(el).find('a[id^="job-title"]');
                    const title = titleEl.text().trim();
                    
                    // Lấy location chính xác (Selector mới nhất 2026)
                    const location = $(el).find('[data-test="location"]').text().trim() || 
                                     $(el).find('[class*="location"]').text().trim() || "Vancouver, BC";

                    let company = $(el).find('[class*="employerName"]').text().trim() || 
                                  $(el).find('[class*="EmployerProfile"]').text().trim();
                    company = company.split(/[\d.]+\s*★/)[0].trim();

                    let link = titleEl.attr('href') || "";
                    if (link && !link.startsWith('http')) link = "https://www.glassdoor.ca" + link;

                    if (title) {
                        allJobs.push({
                            Title: title,
                            Company: company,
                            Salary: $(el).find('[data-test="detailSalary"]').text().trim() || "N/A",
                            Location: location,
                            Link: link.replace('glassdoor.com', 'glassdoor.ca'),
                            Keyword: kw,
                            Date: currentDate
                        });
                    }
                });

                if (allJobs.length > countBefore) {
                    console.log(`✅ Lấy được ${allJobs.length - countBefore} jobs mới cho "${kw}"`);
                    break; 
                }
            } catch (err) {
                console.log(`⚠️ Lỗi Lần ${attempts}: ${err.message}`);
                await new Promise(r => setTimeout(r, 10000)); // Nghỉ lâu hơn để tránh block
            }
        }
    }

    if (allJobs.length > 0) {
        const fileName = `Vancouver_Jobs_${currentDate}.xlsx`;
        const worksheet = XLSX.utils.json_to_sheet(allJobs);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs");
        XLSX.writeFile(workbook, fileName);

        const fileLink = await uploadToCatbox(fileName);
        
        console.log("📤 Đang gửi thông báo...");
        await Promise.all([
            sendTelegramAlert(`✅ Đã tìm thấy ${allJobs.length} jobs tại Vancouver, BC!`),
            sendTelegramFile(fileName),
            sendToTeams(allJobs.length, fileLink) // Gửi sang Teams
        ]);
        console.log("🏁 Hoàn tất!");
    } else {
        await sendTelegramAlert("❌ Không tìm thấy job nào. Hãy kiểm tra API Key.");
    }
}

runScraper();