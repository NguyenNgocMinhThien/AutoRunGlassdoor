const axios = require('axios');
const cheerio = require('cheerio');
const xlsx = require('xlsx');
const fs = require('fs');

// --- CẤU HÌNH ---
const KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"];
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message, filePath = null) {
    if (!TELEGRAM_TOKEN) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
    
    try {
        // Gửi tin nhắn văn bản
        await axios.post(`${url}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });

        // Gửi file nếu có
        if (filePath && fs.existsSync(filePath)) {
            const FormData = require('form-data');
            const form = new FormData();
            form.append('chat_id', TELEGRAM_CHAT_ID);
            form.append('document', fs.createReadStream(filePath));
            
            await axios.post(`${url}/sendDocument`, form, {
                headers: form.getHeaders()
            });
        }
    } catch (error) {
        console.error("Lỗi gửi Telegram:", error.message);
    }
}

async function runScraper() {
    const startTime = Date.now();
    console.log("🚀 Khởi động tối ưu (Mục tiêu < 2p)...");
    const allJobs = [];
    const currentDate = new Date().toISOString().split('T')[0];

    for (const kw of KEYWORDS) {
        console.log(`🔍 Quét: ${kw}...`);
        
        try {
            const response = await axios.get('http://api.scraperapi.com', {
                params: {
                    api_key: SCRAPER_API_KEY,
                    url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${kw}&fromAge=3`,
                    render: 'false',
                    premium: 'true',
                    country_code: 'us'
                },
                timeout: 15000
            });

            if (response.status !== 200) {
                console.log(`⚠️ Bỏ qua ${kw} (Mã lỗi API: ${response.status})`);
                continue;
            }

            const $ = cheerio.load(response.data);
            const listings = $('li[data-test="jobListing"], div[data-test="jobListing"]');
            let kwCount = 0;

            listings.each((i, el) => {
                try {
                    const titleEl = $(el).find('a[data-test="job-title"]');
                    // Selector linh hoạt cho Company
                    const companyEl = $(el).find('.EmployerProfile_employerName__D_zzf').text() || 
                                     $(el).find('[class*="employerName"]').text() || 
                                     $(el).find('.job-search-8vbe7v').text();
                    
                    if (titleEl.length) {
                        allJobs.push({
                            "Title": titleEl.text().trim(),
                            "Company": companyEl.split('★')[0].trim() || "N/A",
                            "Salary": $(el).find('[data-test="detailSalary"]').text().trim() || "",
                            "Link": titleEl.attr('href').startsWith('http') ? titleEl.attr('href') : "https://www.glassdoor.com" + titleEl.attr('href'),
                            "Keyword": kw,
                            "Date": currentDate
                        });
                        kwCount++;
                    }
                } catch (e) { /* skip error */ }
            });

            console.log(`✅ Lấy được ${kwCount} jobs.`);
        } catch (error) {
            console.log(`❗ Lỗi kết nối ${kw}: ${error.message}`);
        }
    }

    // Xuất file và gửi báo cáo
    if (allJobs.length > 0) {
        const fileName = `Glassdoor_Jobs_${currentDate}.xlsx`;
        const ws = xlsx.utils.json_to_sheet(allJobs);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Jobs");
        xlsx.writeFile(wb, fileName);

        await sendTelegram(`✅ <b>[Glassdoor]</b> Quét xong ${allJobs.length} jobs!`, fileName);
    } else {
        await sendTelegram("❌ Glassdoor: Không tìm thấy dữ liệu sau khi quét.");
    }

    const endTime = Date.now();
    console.log(`🏁 Hoàn tất trong ${((endTime - startTime) / 1000).toFixed(2)}s`);
}

runScraper();