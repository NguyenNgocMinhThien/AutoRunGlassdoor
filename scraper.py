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
    requests.post(f"{url}/sendMessage", data={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "HTML"})
    if file_path and os.path.exists(file_path):
        with open(file_path, 'rb') as f:
            requests.post(f"{url}/sendDocument", data={"chat_id": TELEGRAM_CHAT_ID}, files={"document": f})

def run_scraper():
    print("🚀 Khởi động tối ưu (Mục tiêu < 2p)...")
    all_jobs = []
    current_date = datetime.now().strftime("%Y-%m-%d")

    for kw in KEYWORDS:
        # Giảm số lần retry và timeout để thoát nhanh nếu API lỗi
        print(f"🔍 Quét: {kw}...")
        payload = {
            'api_key': SCRAPER_API_KEY,
            'url': f"https://www.glassdoor.com/Job/jobs.htm?sc.keyword={kw}&fromAge=3",
            'render': 'false', # Tắt render để tăng tốc gấp 5 lần
            'premium': 'true',
            'country_code': 'us'
        }

        try:
            # Timeout thấp (20s) để không bị treo máy
            response = requests.get('http://api.scraperapi.com', params=payload, timeout=20)
            if response.status_code != 200: 
                print(f"⚠️ Bỏ qua {kw} (Lỗi {response.status_code})")
                continue

            soup = BeautifulSoup(response.text, 'html.parser')
            listings = soup.find_all(['li', 'div'], {'data-test': 'jobListing'})
            
            for item in listings:
                try:
                    title_el = item.find('a', {'data-test': 'job-title'})
                    # Selector mới nhất để lấy tên công ty, tránh N/A
                    company_el = item.find('span', {'class': 'EmployerProfile_employerName__D_zzf'}) or \
                                 item.find('div', {'class': 'job-search-8vbe7v'})
                    
                    if title_el:
                        all_jobs.append({
                            "Title": title_el.get_text(strip=True),
                            "Company": company_el.get_text(strip=True).split('★')[0] if company_el else "N/A",
                            "Salary": item.find('div', {'data-test': 'detailSalary'}).get_text(strip=True) if item.find('div', {'data-test': 'detailSalary'}) else "",
                            "Link": "https://www.glassdoor.com" + title_el['href'] if not title_el['href'].startswith('http') else title_el['href'],
                            "Keyword": kw,
                            "Date": current_date
                        })
                except: continue
        except Exception as e:
            print(f"❗ Lỗi {kw}: {e}")

    if all_jobs:
        file_name = f"Glassdoor_Jobs_{current_date}.xlsx"
        pd.DataFrame(all_jobs).to_excel(file_name, index=False)
        send_telegram(f"✅ Đã tìm thấy {len(all_jobs)} jobs!", file_name)
        print(f"📊 Hoàn tất trong {time.process_time()}s")
    else:
        send_telegram("❌ Không tìm thấy dữ liệu.")

if __name__ == "__main__":
    run_scraper()