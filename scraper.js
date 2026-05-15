import axios from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- HÀM GỬI MS TEAMS (THEO MẪU CỦA BẠN) ---
async function sendToTeams(n, fileLink) {
    const url = process.env.TEAMS_WEBHOOK_URL;
    if (!url) return;
    try {
        // Cấu trúc bọc ngoài để Workflow MS Teams nhận diện Adaptive Card
        await axios.post(url, {
            type: "message",
            attachments: [{
                contentType: "application/vnd.microsoft.card.adaptive",
                content: {
                    type: "AdaptiveCard",
                    version: "1.4",
                    body: [
                        { type: "TextBlock", text: "🚀 CẬP NHẬT JOB MỚI — VANCOUVER CA", weight: "Bolder", size: "Medium", color: "Accent", wrap: true },
                        { type: "FactSet", facts: [
                            { title: "Nguồn:", value: "Glassdoor Canada" }, 
                            { title: "Khu vực:", value: "Vancouver, BC" },
                            { title: "Số job:", value: `${n}` },     
                            { title: "Status:", value: "✅ Đã quét thành công" }
                        ]}
                    ],
                    actions: [
                        { type: "Action.OpenUrl", title: "📥 Tải Excel", url: fileLink || "https://litterbox.catbox.moe" }
                    ],
                    $schema: "http://adaptivecards.io/schemas/adaptive-card.json"
                }
            }]
        });
        console.log("✅ [Teams] Đã gửi Card thành công!");
    } catch (e) { 
        console.error("❌ [Teams]:", e.response?.data || e.message); 
    }
}

// --- CÁC HÀM PHỤ TRỢ ---
async function uploadToCatbox(filePath) {
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('time', '24h');
        form.append('fileToUpload', fs.createReadStream(filePath));
        const response = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', form, {
            headers: form.getHeaders(),
            timeout: 25000 
        });
        return response.data.trim();
    } catch (error) { 
        console.log("⚠️ Lỗi Catbox: Không lấy được link tải.");
        return ""; 
    }
}

async function sendTelegramFile(filePath) {
    const form = new FormData();
    form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
    form.append('document', fs.createReadStream(filePath));
    try { 
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendDocument`, form, { headers: form.getHeaders() }); 
    } catch (e) { console.log("⚠️ Lỗi gửi Telegram"); }
}

// --- HÀM CHẠY CHÍNH ---
async function runScraper() {
    console.log("🚀 Khởi động Scraper (Mục tiêu < 2 phút)...");
    let allJobs = [];
    const currentDate = new Date().toISOString().split('T')[0];

    for (const kw of KEYWORDS) {
        const targetUrl = `https://www.glassdoor.ca/Job/vancouver-bc-jobs-SRCH_IL.0,12_IC2278757.htm?sc.keyword=${encodeURIComponent(kw)}&fromAge=3`;
        let attempts = 0;
        let success = false;

        while (attempts < 3 && !success) {
            attempts++;
            try {
                console.log(`🔍 Quét: ${kw} (Lần ${attempts})...`);
                const response = await axios.get('http://api.scraperapi.com', {
                    params: {
                        api_key: process.env.SCRAPER_API_KEY,
                        url: targetUrl,
                        premium: 'true', // Bắt buộc để tránh lỗi 500
                        render: 'false',  // Tắt render để đạt tốc độ < 2 phút
                        country_code: 'us' 
                    },
                    timeout: 30000 
                });

                const $ = cheerio.load(response.data);
                let count = 0;
                $('li[data-test="jobListing"]').each((i, el) => {
                    const title = $(el).find('a[id^="job-title"]').text().trim();
                    const company = $(el).find('[class*="EmployerProfile"]').text().split(/[\d.]+\s*★/)[0].trim();
                    let link = $(el).find('a[id^="job-title"]').attr('href') || "";
                    if (link && !link.startsWith('http')) link = "https://www.glassdoor.ca" + link;

                    if (title) {
                        allJobs.push({ Title: title, Company: company || "N/A", Salary: $(el).find('[data-test="detailSalary"]').text().trim() || "N/A", Location: "Vancouver, BC", Link: link, Keyword: kw, Date: currentDate });
                        count++;
                    }
                });

                if (count > 0) {
                    console.log(`✅ Lấy được ${count} jobs cho "${kw}"`);
                    success = true;
                }
                await delay(2000); 
            } catch (err) {
                console.log(`⚠️ Lỗi ${kw}: ${err.message}`);
                if (attempts < 3) await delay(5000 * attempts);
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
        console.log("📤 Đang gửi dữ liệu...");
        await sendTelegramFile(fileName);
        await sendToTeams(allJobs.length, fileLink);
        console.log("🏁 Hoàn tất!");
    }
}

runScraper();