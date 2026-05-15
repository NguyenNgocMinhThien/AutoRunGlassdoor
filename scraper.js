import axios from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"];

// Hàm tạo độ trễ (nghỉ) giữa các lần quét
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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
                    { "type": "TextBlock", "text": "🚀 CẬP NHẬT JOB GLASS DOOR VANCOUVER", "weight": "Bolder", "size": "Medium", "color": "Accent" },
                    {
                        "type": "FactSet",
                        "facts": [
                            { "title": "Nguồn:", "value": "Glassdoor Canada" },
                            { "title": "Số lượng:", "value": `${totalJobs} jobs` },
                            { "title": "Trạng thái:", "value": "Đã hoàn tất ✅" }
                        ]
                    }
                ],
                "actions": [{ "type": "Action.OpenUrl", "title": "📥 TẢI FILE EXCEL", "url": fileLink || "#" }]
            }
        }]
    };

    try {
        await axios.post(webhookUrl, adaptiveCard);
        console.log("✅ [Teams] Đã gửi thông báo thành công!");
    } catch (error) {
        console.error("❌ [Teams] Lỗi gửi:", error.message);
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
            timeout: 30000 
        });
        return response.data.trim();
    } catch (error) { 
        console.log("⚠️ Lỗi Catbox (Timeout), sử dụng file đính kèm Telegram thay thế.");
        return ""; 
    }
}

async function sendTelegramAlert(message) {
    try { 
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, { 
            chat_id: process.env.TELEGRAM_CHAT_ID, 
            text: message, 
            parse_mode: 'HTML' 
        }); 
    } catch (e) { console.log("⚠️ Lỗi gửi tin nhắn Telegram"); }
}

async function sendTelegramFile(filePath) {
    const form = new FormData();
    form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
    form.append('document', fs.createReadStream(filePath));
    try { 
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendDocument`, form, { 
            headers: form.getHeaders(),
            timeout: 60000
        }); 
    } catch (e) { console.log("⚠️ Lỗi gửi file Telegram"); }
}

// --- HÀM CHẠY CHÍNH ---
async function runScraper() {
    const startTime = Date.now();
    console.log("🚀 Khởi động Scraper (Mục tiêu < 2 phút)...");
    let allJobs = [];
    const currentDate = new Date().toISOString().split('T')[0];

    for (const kw of KEYWORDS) {
        const targetUrl = `https://www.glassdoor.ca/Job/vancouver-bc-jobs-SRCH_IL.0,12_IC2278757.htm?sc.keyword=${encodeURIComponent(kw)}&fromAge=3`;
        
        let attempts = 0;
        let success = false;
        const maxAttempts = 3;

        while (attempts < maxAttempts && !success) {
            attempts++;
            try {
                console.log(`🔍 Quét: ${kw} (Lần ${attempts})...`);
                const response = await axios.get('http://api.scraperapi.com', {
                    params: {
                        api_key: process.env.SCRAPER_API_KEY,
                        url: targetUrl,
                        premium: 'true',
                        render: 'false', // Tắt render để tăng tốc độ phản hồi cực nhanh
                        country_code: 'us' 
                    },
                    timeout: 30000 // Giảm timeout xuống 30s để xử lý lỗi nhanh hơn
                });

                const $ = cheerio.load(response.data);
                let count = 0;

                $('li[data-test="jobListing"]').each((i, el) => {
                    const title = $(el).find('a[id^="job-title"]').text().trim();
                    // Selector linh hoạt lấy tên công ty, loại bỏ sao đánh giá
                    const companyRaw = $(el).find('[class*="EmployerProfile"]').text() || $(el).find('[class*="employerName"]').text();
                    const company = companyRaw.split(/[\d.]+\s*★/)[0].trim();
                    
                    let link = $(el).find('a[id^="job-title"]').attr('href') || "";
                    if (link && !link.startsWith('http')) link = "https://www.glassdoor.ca" + link;

                    if (title) {
                        allJobs.push({
                            Title: title,
                            Company: company || "N/A",
                            Salary: $(el).find('[data-test="detailSalary"]').text().trim() || "N/A",
                            Location: "Vancouver, BC",
                            Link: link,
                            Keyword: kw,
                            Date: currentDate
                        });
                        count++;
                    }
                });

                if (count > 0) {
                    console.log(`✅ ${kw}: Lấy được ${count} jobs.`);
                    success = true;
                } else {
                    console.log(`⚠️ ${kw}: Trang trống (Lần ${attempts}). Thử lại...`);
                }
                
                // Nghỉ ngắn giữa các từ khóa
                await delay(2000);

            } catch (err) {
                console.log(`⚠️ Lỗi ${kw} (Lần ${attempts}): ${err.response?.status || err.message}`);
                if (attempts < maxAttempts) {
                    await delay(5000 * attempts); // Đợi tăng dần trước khi retry
                }
            }
        }
    }

    if (allJobs.length > 0) {
        const fileName = `Vancouver_Jobs_${currentDate}.xlsx`;
        const worksheet = XLSX.utils.json_to_sheet(allJobs);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs");
        XLSX.writeFile(workbook, fileName);

        console.log("📤 Đang gửi báo cáo...");
        const fileLink = await uploadToCatbox(fileName);
        
        await sendTelegramAlert(`✅ <b>[Glassdoor]</b> Quét thành công <b>${allJobs.length}</b> jobs!`);
        await sendTelegramFile(fileName);
        await sendToTeams(allJobs.length, fileLink);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`🏁 Hoàn tất trong ${duration} giây!`);
    } else {
        console.log("❌ Không lấy được dữ liệu sau khi đã thử lại.");
        await sendTelegramAlert("❌ Glassdoor: Không tìm thấy job nào hôm nay.");
    }
}

runScraper();