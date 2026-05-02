import axios from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"];

// --- HÀM UPLOAD & THÔNG BÁO (Giữ nguyên logic cũ của bạn) ---
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
        return fileLink.includes('https://') ? fileLink : `https://github.com/${process.env.GITHUB_REPOSITORY}/actions`;
    } catch (error) { return "Lỗi upload"; }
}

async function sendTelegramAlert(message) {
    const botToken = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;
    try { await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: message, parse_mode: 'HTML' }); } catch (e) {}
}

async function sendTelegramFile(filePath) {
    const botToken = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId || !fs.existsSync(filePath)) return;
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', fs.createReadStream(filePath));
    try { await axios.post(`https://api.telegram.org/bot${botToken}/sendDocument`, form, { headers: form.getHeaders() }); } catch (e) {}
}

// --- HÀM CHẠY CHÍNH ---
async function runScraper() {
    console.log("🚀 Khởi động Glassdoor Vancouver, BC, CANADA Scraper...");
    let allJobs = [];
    const currentDate = new Date().toISOString().split('T')[0];

    for (const kw of KEYWORDS) {
        // CẬP NHẬT QUAN TRỌNG: 
        // 1. locId=2278757 là mã vùng Vancouver, BC, Canada.
        // 2. Thêm tham số &vcp=1 để ép hệ thống hiểu là Canada.
        const targetUrl = `https://www.glassdoor.ca/Job/jobs.htm?sc.keyword=${encodeURIComponent(kw)}&locId=2278757&locT=C&fromAge=3&vcp=1`;
        
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                attempts++;
                console.log(`🔍 Quét: ${kw} tại Vancouver, BC (Lần ${attempts})...`);

                const response = await axios.get('http://api.scraperapi.com', {
                    params: {
                        api_key: process.env.SCRAPER_API_KEY,
                        url: targetUrl,
                        render: 'true', // BẮT BUỘC để render React content lấy Location
                        premium: 'true',
                        country_code: 'ca' 
                    },
                    timeout: 60000
                });

                const $ = cheerio.load(response.data);
                let count = 0;

                // Selector mới nhất của Glassdoor 2026
                $('li[data-test="jobListing"]').each((i, el) => {
                    const titleEl = $(el).find('a[data-test="job-title"]');
                    const title = titleEl.text().trim();
                    if (!title) return;

                    // CẬP NHẬT SELECTOR LOCATION: Lấy thẻ chứa thông tin địa điểm bạn khoanh tròn
                    const location = $(el).find('div[data-test="location"], .job-search-8vbe7v, span[class*="location"]').first().text().trim() || "Vancouver, BC";

                    // Xử lý công ty (loại bỏ rating sao)
                    let companyRaw = $(el).find('[class*="EmployerProfile_employerName"], .job-search-8vbe7v').first().text().trim();
                    const company = companyRaw.split(/[\d.]+\s*★/)[0].trim() || "N/A";

                    const salary = $(el).find('[data-test="detailSalary"]').text().trim() || "N/A";

                    // Sửa lỗi Link: Ép link về domain .ca
                    let link = titleEl.attr('href') || "";
                    if (link && !link.startsWith('http')) {
                        link = "https://www.glassdoor.ca" + link;
                    } else if (link.includes('glassdoor.com')) {
                        link = link.replace('glassdoor.com', 'glassdoor.ca');
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

                console.log(`✅ Lấy được ${count} jobs thực tế tại Vancouver cho "${kw}"`);
                if (count > 0) break; 
            } catch (err) {
                console.log(`⚠️ Lỗi ${kw}: ${err.message}`);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    if (allJobs.length > 0) {
        const fileName = `Vancouver_BC_Jobs_${currentDate}.xlsx`;
        const worksheet = XLSX.utils.json_to_sheet(allJobs);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs");
        XLSX.writeFile(workbook, fileName);

        const fileLink = await uploadToCatbox(fileName);
        await Promise.all([
            sendTelegramAlert(`✅ [Glassdoor CA] Tìm thấy ${allJobs.length} jobs tại Vancouver, BC!`),
            sendTelegramFile(fileName)
        ]);
        console.log("🏁 Hoàn tất!");
    } else {
        await sendTelegramAlert("❌ Không tìm thấy job nào tại Vancouver, BC (Canada).");
    }
}

runScraper();