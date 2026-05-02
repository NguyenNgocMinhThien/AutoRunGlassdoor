import axios from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"];

// --- HÀM GỬI MS TEAMS (ĐÃ FIX CARD) ---
async function sendToTeams(totalJobs, fileLink) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (!webhookUrl) return;

    // Payload này đã được kiểm tra để tương thích hoàn toàn với MS Teams mới nhất
    const payload = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "type": "AdaptiveCard",
                "body": [
                    { "type": "TextBlock", "text": "✅ ĐÃ CẬP NHẬT DỮ LIỆU VANCOUVER", "weight": "Bolder", "size": "Large", "color": "Good" },
                    { "type": "TextBlock", "text": `Tìm thấy tổng cộng: **${totalJobs}** vị trí mới.`, "wrap": true },
                    { "type": "TextBlock", "text": "Vui lòng tải file Excel bên dưới để xem chi tiết.", "isSubtle": true, "wrap": true }
                ],
                "actions": [
                    { "type": "Action.OpenUrl", "title": "📥 Tải File Kết Quả", "url": fileLink }
                ],
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "version": "1.4"
            }
        }]
    };

    try {
        await axios.post(webhookUrl, payload);
        console.log("✅ [Teams] Gửi báo cáo thành công!");
    } catch (error) {
        console.error("❌ [Teams] Lỗi gửi (Kiểm tra lại Webhook URL):", error.message);
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
    console.log("🚀 Khởi động Scraper Vancouver (Bản Fix Lỗi 500)...");
    let allJobs = [];
    const currentDate = new Date().toISOString().split('T')[0];

    for (const kw of KEYWORDS) {
        // Sử dụng ID Vancouver chuẩn: IC2278757
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
                        render: 'false', // Đổi về false để giảm tải cho API, tránh lỗi 500
                        country_code: 'us' 
                    },
                    timeout: 60000
                });

                const $ = cheerio.load(response.data);
                let currentCount = 0;

                $('li[data-test="jobListing"]').each((i, el) => {
                    const titleEl = $(el).find('a[id^="job-title"]');
                    const title = titleEl.text().trim();
                    
                    // Selector Location đa tầng để tránh N/A
                    const location = $(el).find('[data-test="location"]').text().trim() || 
                                     $(el).find('.job-search-8vbe7v').text().trim() || "Vancouver, BC";

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
                        currentCount++;
                    }
                });

                if (currentCount > 0) {
                    console.log(`✅ Thành công: Lấy được ${currentCount} jobs cho "${kw}"`);
                    break; 
                }
            } catch (err) {
                console.log(`⚠️ Thử lại ${kw} do lỗi: ${err.message}`);
                await new Promise(r => setTimeout(r, 10000)); // Nghỉ 10s trước khi thử lại
            }
        }
        // NGHỈ 15 GIÂY GIỮA CÁC TỪ KHÓA ĐỂ TRÁNH LỖI 500 TRÊN TOÀN HỆ THỐNG
        console.log("⏸ Nghỉ 15s để ổn định kết nối...");
        await new Promise(r => setTimeout(r, 15000));
    }

    if (allJobs.length > 0) {
        const fileName = `Vancouver_Jobs_${currentDate}.xlsx`;
        const worksheet = XLSX.utils.json_to_sheet(allJobs);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs");
        XLSX.writeFile(workbook, fileName);

        const fileLink = await uploadToCatbox(fileName);
        
        console.log("📤 Đang phát tán dữ liệu...");
        await sendTelegramAlert(`✅ [Glassdoor] Tìm thấy ${allJobs.length} jobs mới!`);
        await sendTelegramFile(fileName);
        await sendToTeams(allJobs.length, fileLink); // Đây là hàm bạn cần
        
        console.log("🏁 Xong!");
    } else {
        console.log("❌ Kết thúc: Không có dữ liệu để gửi.");
        await sendTelegramAlert("❌ Quét hoàn tất nhưng không tìm thấy job nào. Kiểm tra ScraperAPI.");
    }
}

runScraper();