import axios from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"];

// --- HÀM UPLOAD & THÔNG BÁO ---
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
    try { await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, { chat_id: process.env.TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }); } catch (e) {}
}

async function sendTelegramFile(filePath) {
    const form = new FormData();
    form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
    form.append('document', fs.createReadStream(filePath));
    try { await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendDocument`, form, { headers: form.getHeaders() }); } catch (e) {}
}

// --- HÀM CHẠY CHÍNH ---
async function runScraper() {
    console.log("🚀 Bắt đầu quét Vancouver, BC, CANADA...");
    let allJobs = [];
    const currentDate = new Date().toISOString().split('T')[0];

    for (const kw of KEYWORDS) {
        // MÃ VÙNG CHUẨN VANCOUVER, BC: 2278757
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
                        render: 'true', // BẮT BUỘC để lấy được thẻ Location
                        premium: 'true',
                        country_code: 'ca' 
                    },
                    timeout: 90000
                });

                const $ = cheerio.load(response.data);
                
                $('li[data-test="jobListing"]').each((i, el) => {
                    // 1. Lấy Title & Link
                    const titleEl = $(el).find('a[id^="job-title"]');
                    const title = titleEl.text().trim();
                    let link = titleEl.attr('href') || "";
                    if (link && !link.startsWith('http')) link = "https://www.glassdoor.ca" + link;
                    // Force đổi .com thành .ca nếu có
                    link = link.replace('glassdoor.com', 'glassdoor.ca');

                    // 2. Lấy Location (Nơi bạn khoanh tròn)
                    // Glassdoor dùng div class JobCard_location__... hoặc data-test="location"
                    const location = $(el).find('[class*="location"], [data-test="location"]').first().text().trim() || "Vancouver, BC";

                    // 3. Lấy Company
                    let company = $(el).find('[class*="EmployerProfile_employerName"]').first().text().trim();
                    company = company.split(/[\d.]+\s*★/)[0].trim();

                    // 4. Lấy Salary
                    const salary = $(el).find('[data-test="detailSalary"]').text().trim() || "N/A";

                    if (title) {
                        allJobs.push({
                            Title: title,
                            Company: company,
                            Salary: salary,
                            Location: location,
                            Link: link,
                            Keyword: kw,
                            Date: currentDate
                        });
                    }
                });

                if (allJobs.length > 0) break;
            } catch (err) {
                console.log(`⚠️ Lỗi: ${err.message}`);
                await new Promise(r => setTimeout(r, 5000));
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
        await Promise.all([
            sendTelegramAlert(`✅ Đã tìm thấy ${allJobs.length} jobs tại Vancouver, BC!`),
            sendTelegramFile(fileName)
        ]);
    } else {
        await sendTelegramAlert("❌ Không tìm thấy job nào. Hãy kiểm tra ScraperAPI Credit.");
    }
}

runScraper();