import axios from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"];

// --- HÀM GỬI MS TEAMS (ĐÃ FIX HIỂN THỊ) ---
async function sendToTeams(totalJobs, fileLink) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (!webhookUrl) return;

    // Cấu trúc Adaptive Card chuẩn 1.4 - Đảm bảo không bị trống tin nhắn
    const cardContent = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": "📊 BÁO CÁO VIỆC LÀM VANCOUVER",
                        "weight": "Bolder",
                        "size": "Large",
                        "color": "Accent"
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            { "title": "Tổng số Job:", "value": `${totalJobs}` },
                            { "title": "Khu vực:", "value": "Vancouver, BC" },
                            { "title": "Ngày cập nhật:", "value": new Date().toLocaleDateString('vi-VN') }
                        ]
                    },
                    {
                        "type": "TextBlock",
                        "text": "Nhấn nút bên dưới để tải file chi tiết (Excel):",
                        "wrap": true,
                        "isSubtle": true
                    }
                ],
                "actions": [
                    {
                        "type": "Action.OpenUrl",
                        "title": "📥 Tải File Kết Quả",
                        "url": fileLink || "https://litterbox.catbox.moe"
                    }
                ]
            }
        }]
    };

    try {
        const res = await axios.post(webhookUrl, cardContent);
        if (res.status === 200) {
            console.log("✅ [Teams] Đã gửi báo cáo thành công vào channel!");
        }
    } catch (error) {
        console.error("❌ [Teams] Lỗi gửi tin nhắn:", error.response?.data || error.message);
    }
}

// --- CÁC HÀM PHỤ TRỢ KHÁC ---
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
    console.log("🚀 Khởi động Scraper Vancouver...");
    let allJobs = [];
    const currentDate = new Date().toISOString().split('T')[0];

    for (const kw of KEYWORDS) {
        const targetUrl = `https://www.glassdoor.ca/Job/vancouver-bc-jobs-SRCH_IL.0,12_IC2278757.htm?sc.keyword=${encodeURIComponent(kw)}&fromAge=3`;
        
        try {
            console.log(`🔍 Quét: ${kw}...`);
            const response = await axios.get('http://api.scraperapi.com', {
                params: {
                    api_key: process.env.SCRAPER_API_KEY,
                    url: targetUrl,
                    premium: 'true',
                    country_code: 'us' 
                },
                timeout: 60000
            });

            const $ = cheerio.load(response.data);
            let count = 0;

            $('li[data-test="jobListing"]').each((i, el) => {
                const title = $(el).find('a[id^="job-title"]').text().trim();
                const company = $(el).find('[class*="EmployerProfile"]').text().split(/[\d.]+\s*★/)[0].trim();
                let link = $(el).find('a[id^="job-title"]').attr('href') || "";
                if (link && !link.startsWith('http')) link = "https://www.glassdoor.ca" + link;

                if (title) {
                    allJobs.push({
                        Title: title,
                        Company: company,
                        Salary: $(el).find('[data-test="detailSalary"]').text().trim() || "N/A",
                        Location: "Vancouver, BC",
                        Link: link,
                        Keyword: kw,
                        Date: currentDate
                    });
                    count++;
                }
            });
            console.log(`✅ Lấy được ${count} jobs cho "${kw}"`);
            await new Promise(r => setTimeout(r, 10000)); // Nghỉ tránh lỗi 500
        } catch (err) {
            console.log(`⚠️ Lỗi ${kw}: ${err.message}`);
        }
    }

    if (allJobs.length > 0) {
        const fileName = `Vancouver_Jobs_${currentDate}.xlsx`;
        const worksheet = XLSX.utils.json_to_sheet(allJobs);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs");
        XLSX.writeFile(workbook, fileName);

        const fileLink = await uploadToCatbox(fileName);
        
        console.log("📤 Đang gửi dữ liệu...");
        await sendTelegramAlert(`✅ Tìm thấy ${allJobs.length} jobs mới!`);
        await sendTelegramFile(fileName);
        await sendToTeams(allJobs.length, fileLink); // Hàm đã fix nằm ở đây
        
        console.log("🏁 Hoàn tất!");
    }
}

runScraper();