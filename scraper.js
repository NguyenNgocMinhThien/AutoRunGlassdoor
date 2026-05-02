import axios from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"];

// --- HÀM UPLOAD LITTERBOX ---
async function uploadToCatbox(filePath) {
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('time', '24h');
        form.append('fileToUpload', fs.createReadStream(filePath));

        const response = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', form, {
            headers: form.getHeaders()
        });

        const fileLink = response.data.trim();
        if (fileLink.includes('https://')) return fileLink;
        throw new Error("Invalid link: " + fileLink);
    } catch (error) {
        console.error("❌ Lỗi Catbox:", error.message);
        return `https://github.com/${process.env.GITHUB_REPOSITORY}/actions`;
    }
}

// --- HÀM GỬI TEAMS ---
async function sendToTeams(totalJobs, fileLink) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (!webhookUrl) return;

    const adaptiveCard = {
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
            { "type": "TextBlock", "text": "🚀 CẬP NHẬT JOB MỚI TẠI GREATER VANCOUVER", "weight": "Bolder", "size": "Medium", "color": "Accent" },
            {
                "type": "FactSet",
                "facts": [
                    { "title": "Nguồn:", "value": "Glassdoor Canada" },
                    { "title": "Khu vực:", "value": "Vancouver & Vùng lân cận" },
                    { "title": "Số lượng:", "value": `${totalJobs} jobs` }
                ]
            }
        ],
        "actions": [
            { "type": "Action.OpenUrl", "title": "📥 TẢI FILE EXCEL VỀ MÁY", "url": fileLink }
        ],
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
    };

    try {
        await axios.post(webhookUrl, adaptiveCard);
        console.log("✅ [Teams] Đã gửi Card thành công!");
    } catch (error) {
        console.error("❌ [Teams] Lỗi gửi:", error.message);
    }
}

// --- HÀM GỬI TELEGRAM ---
async function sendTelegramAlert(message) {
    const botToken = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;
    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId, text: message, parse_mode: 'HTML'
        });
    } catch (e) { console.error("❌ Telegram Alert Error:", e.message); }
}

async function sendTelegramFile(filePath) {
    const botToken = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId || !fs.existsSync(filePath)) return;
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', fs.createReadStream(filePath));
    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendDocument`, form, {
            headers: form.getHeaders()
        });
    } catch (e) { console.error("❌ Telegram File Error:", e.message); }
}

// --- HÀM CHẠY CHÍNH ---
async function runScraper() {
    console.log("🚀 Khởi động Glassdoor Vancouver Scraper...");
    let allJobs = [];
    const currentDate = new Date().toISOString().split('T')[0];

    // Danh sách các từ khóa địa điểm hợp lệ để lọc thủ công
    const validLocations = ["vancouver", "burnaby", "north vancouver", "west vancouver", "richmond", "surrey", "coquitlam", "bc", "british columbia"];

    for (const kw of KEYWORDS) {
        // CẬP NHẬT: Sử dụng .ca và locId cho Greater Vancouver (1147401)
        const targetUrl = `https://www.glassdoor.ca/Job/jobs.htm?sc.keyword=${encodeURIComponent(kw)}&locId=1147401&locT=C&fromAge=3`;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                attempts++;
                console.log(`🔍 Quét: ${kw} tại Vancouver (Lần ${attempts})...`);

                const response = await axios.get('http://api.scraperapi.com', {
                    params: {
                        api_key: process.env.SCRAPER_API_KEY,
                        url: targetUrl,
                        render: 'false',
                        premium: 'true',
                        country_code: 'ca' // Ưu tiên IP Canada
                    },
                    timeout: 60000
                });

                const $ = cheerio.load(response.data);
                let count = 0;

                $('li[data-test="jobListing"], div[data-test="jobListing"]').each((i, el) => {
                    const titleEl = $(el).find('a[data-test="job-title"]');
                    const title = titleEl.text().trim();
                    if (!title) return;

                    // Lấy địa điểm và kiểm tra
                    const location = $(el).find('[data-test="location"]').text().trim() || "N/A";
                    
                    // LỌC THỦ CÔNG: Nếu location không chứa các từ khóa vùng Vancouver thì bỏ qua
                    const isVancouverArea = validLocations.some(loc => location.toLowerCase().includes(loc));
                    if (!isVancouverArea && location !== "N/A") return;

                    let companyRaw = $(el).find('[class*="EmployerProfile_employerName"], [class*="employerName"], .job-search-8vbe7v').first().text().trim();
                    const company = companyRaw.split(/[\d.]+\s*★/)[0].trim() || "N/A";

                    const salary = $(el).find('[data-test="detailSalary"]').text().trim() || "";

                    let link = titleEl.attr('href') || "";
                    if (link && !link.startsWith('http')) {
                        link = "https://www.glassdoor.ca" + link;
                    }

                    allJobs.push({
                        Title: title,
                        Company: company,
                        Salary: salary,
                        Location: location,
                        Link: link,
                        Keyword: kw,
                        Date: currentDate
                    });

                    count++;
                });

                console.log(`✅ Lấy được ${count} jobs tại Vancouver cho "${kw}"`);
                if (count > 0) break; 

            } catch (err) {
                console.log(`⚠️ Lỗi ${kw}: ${err.message}`);
                if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    if (allJobs.length > 0) {
        const fileName = `Vancouver_Jobs_${currentDate}.xlsx`;

        const worksheet = XLSX.utils.json_to_sheet(allJobs);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs");
        XLSX.writeFile(workbook, fileName);

        console.log(`📊 Đã lưu ${allJobs.length} jobs vào ${fileName}`);

        const fileLink = await uploadToCatbox(fileName);

        await Promise.all([
            sendTelegramAlert(`✅ [Glassdoor] Tìm thấy ${allJobs.length} jobs mới tại Vancouver!`),
            sendTelegramFile(fileName),
            sendToTeams(allJobs.length, fileLink)
        ]);

        console.log("🏁 Hoàn tất!");
    } else {
        console.log("❌ Không tìm thấy job nào ở Vancouver.");
        await sendTelegramAlert("❌ [Glassdoor] Không tìm thấy job mới nào tại Vancouver.");
    }
}

runScraper();