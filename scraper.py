import os, requests, pandas as pd, time
from bs4 import BeautifulSoup
from datetime import datetime

# --- CẤU HÌNH ---
KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"]
SCRAPER_API_KEY = os.environ.get('SCRAPER_API_KEY')
TELEGRAM_TOKEN = os.environ.get('TELEGRAM_TOKEN')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID')

def send_telegram(message, file_path=None):
    if not TELEGRAM_TOKEN: return
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
    try:
        requests.post(f"{url}/sendMessage", data={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "HTML"}, timeout=10)
        if file_path and os.path.exists(file_path):
            with open(file_path, 'rb') as f:
                requests.post(f"{url}/sendDocument", data={"chat_id": TELEGRAM_CHAT_ID}, files={"document": f}, timeout=20)
    except: pass

def run_scraper():
    start_time = time.time()
    print("🚀 Khởi động tối ưu (Mục tiêu < 2p)...")
    all_jobs = []
    current_date = datetime.now().strftime("%Y-%m-%d")

    for kw in KEYWORDS:
        print(f"🔍 Quét: {kw}...")
        payload = {
            'api_key': SCRAPER_API_KEY,
            'url': f"https://www.glassdoor.com/Job/jobs.htm?sc.keyword={kw}&fromAge=3",
            'render': 'false',  # Tắt render để phản hồi trong 2-5 giây thay vì 30 giây
            'premium': 'true',  # Bắt buộc dùng IP dân dụng để tránh lỗi 500/Cloudflare
            'country_code': 'us'
        }

        try:
            # Rút ngắn timeout xuống 15s để thoát nhanh nếu API lag
            response = requests.get('http://api.scraperapi.com', params=payload, timeout=15)
            
            if response.status_code != 200:
                print(f"⚠️ Bỏ qua {kw} (Mã lỗi API: {response.status_code})")
                continue

            soup = BeautifulSoup(response.text, 'html.parser')
            # Selector linh hoạt để lấy chính xác danh sách job
            listings = soup.select('li[data-test="jobListing"], div[data-test="jobListing"]')
            
            kw_count = 0
            for item in listings:
                try:
                    title_el = item.select_one('a[data-test="job-title"]')
                    # Sửa lỗi N/A: Tìm tên công ty qua nhiều class dự phòng
                    company_el = item.select_one('.EmployerProfile_employerName__D_zzf') or \
                                 item.select_one('[class*="employerName"]') or \
                                 item.select_one('.job-search-8vbe7v')
                    
                    if title_el:
                        all_jobs.append({
                            "Title": title_el.get_text(strip=True),
                            "Company": company_el.get_text(strip=True).split('★')[0].strip() if company_el else "N/A",
                            "Salary": item.select_one('[data-test="detailSalary"]').get_text(strip=True) if item.select_one('[data-test="detailSalary"]') else "",
                            "Link": "https://www.glassdoor.com" + title_el['href'] if not title_el['href'].startswith('http') else title_el['href'],
                            "Keyword": kw,
                            "Date": current_date
                        })
                        kw_count += 1
                except: continue
            print(f"✅ Lấy được {kw_count} jobs.")
        except Exception as e:
            print(f"❗ Lỗi kết nối {kw}: {e}")

    # Xuất file và gửi báo cáo
    if all_jobs:
        file_name = f"Glassdoor_Jobs_{current_date}.xlsx"
        pd.DataFrame(all_jobs).to_excel(file_name, index=False, engine='openpyxl')
        send_telegram(f"✅ <b>[Glassdoor]</b> Quét xong {len(all_jobs)} jobs!", file_name)
    else:
        send_telegram("❌ Glassdoor: Không tìm thấy dữ liệu sau khi quét.")

    end_time = time.time()
    print(f"🏁 Hoàn tất trong {round(end_time - start_time, 2)}s")

if __name__ == "__main__":
    run_scraper()