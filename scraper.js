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

    // --- TRONG HÀM runScraper() ---
    // --- TRONG HÀM runScraper() ---
for (const kw of KEYWORDS) {
    // SỬ DỤNG URL CỐ ĐỊNH CHO VANCOUVER, BC ĐỂ TRÁNH REDIRECT SANG MỸ
    const targetUrl = `https://www.glassdoor.ca/Job/vancouver-bc-jobs-SRCH_IL.0,12_IC2278757.htm?sc.keyword=${encodeURIComponent(kw)}`;
    
    let attempts = 0;
    while (attempts < 3) {
        try {
            attempts++;
            console.log(`🔍 Quét: ${kw} (Lần ${attempts})...`);

            const response = await axios.get('http://api.scraperapi.com', {
                params: {
                    api_key: process.env.SCRAPER_API_KEY,
                    url: targetUrl,
                    // THAY ĐỔI TẠI ĐÂY:
                    premium: 'true', 
                    render: 'false', // Tắt render để giảm lỗi 500 và tăng tốc độ
                    country_code: 'us' // Thử dùng IP Mỹ (ổn định hơn) để quét trang .ca vẫn ra Vancouver
                },
                timeout: 60000
            });

            const $ = cheerio.load(response.data);
            
            // Selector cập nhật để lấy đúng dữ liệu từ cấu trúc mới
            $('li[data-test="jobListing"]').each((i, el) => {
                const titleEl = $(el).find('a[id^="job-title"]');
                const title = titleEl.text().trim();
                
                // Lấy location chính xác (phần text bạn khoanh tròn trong ảnh)
                const location = $(el).find('[data-test="location"]').first().text().trim() || 
                                 $(el).find('.job-search-8vbe7v').first().text().trim() || "Vancouver, BC";

                let company = $(el).find('[class*="EmployerProfile_employerName"]').first().text().trim();
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

            if (allJobs.length > 0) {
                console.log(`✅ Lấy được ${allJobs.length} jobs cho từ khóa "${kw}"`);
                break; 
            }
        } catch (err) {
            console.log(`⚠️ Lỗi kết nối (Lần ${attempts}): ${err.message}`);
            if (attempts === 3) await sendTelegramAlert(`❌ Lỗi 500 quá nhiều cho từ khóa: ${kw}`);
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