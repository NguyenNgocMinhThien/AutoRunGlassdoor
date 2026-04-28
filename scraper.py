import os
import requests
import pandas as pd
from bs4 import BeautifulSoup
import time
from datetime import datetime

# --- CẤU HÌNH BIẾN MÔI TRƯỜNG ---
KEYWORDS = ["Analyst", "CFA", "CEO", "Data Science", "FP&A"]
SCRAPER_API_KEY = os.environ.get('SCRAPER_API_KEY')
TEAMS_WEBHOOK = os.environ.get('TEAMS_WEBHOOK_URL')
TELEGRAM_TOKEN = os.environ.get('TELEGRAM_TOKEN')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID')

def upload_to_catbox(file_path):
    """Tải file lên Litterbox (tồn tại 24h) để lấy link cho Teams"""
    try:
        url = 'https://litterbox.catbox.moe/resources/internals/api.php'
        with open(file_path, 'rb') as f:
            files = {'fileToUpload': f}
            data = {'reqtype': 'fileupload', 'time': '24h'}
            response = requests.post(url, data=data, files=files, timeout=30)
        return response.text.strip()
    except Exception as e:
        print(f"❌ Lỗi Catbox (Timeout/Down): {e}")
        return ""

def send_to_teams(total_jobs, file_link):
    """Gửi Adaptive Card tới Microsoft Teams"""
    if not TEAMS_WEBHOOK: return
    card = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {"type": "TextBlock", "text": "🚀 CẬP NHẬT JOB GLASS DOOR", "weight": "Bolder", "size": "Medium", "color": "Accent"},
                    {"type": "FactSet", "facts": [
                        {"title": "Nguồn:", "value": "Glassdoor"},
                        {"title": "Số lượng:", "value": f"{total_jobs} jobs"},
                        {"title": "Trạng thái:", "value": "Đã sẵn sàng ✅"}
                    ]}
                ],
                "actions": [{"type": "Action.OpenUrl", "title": "📥 TẢI FILE EXCEL", "url": file_link}] if file_link else []
            }
        }]
    }
    requests.post(TEAMS_WEBHOOK, json=card)

def send_telegram(message, file_path=None):
    """Gửi thông báo và file Excel qua Telegram"""
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID: return
    base_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
    requests.post(f"{base_url}/sendMessage", data={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "HTML"})
    if file_path and os.path.exists(file_path):
        with open(file_path, 'rb') as f:
            requests.post(f"{base_url}/sendDocument", data={"chat_id": TELEGRAM_CHAT_ID}, files={"document": f})

def run_scraper():
    print("🚀 Khởi động Glassdoor Scraper...")
    all_jobs = []
    current_date = datetime.now().strftime("%Y-%m-%d")

    for kw in KEYWORDS:
        target_url = f"https://www.glassdoor.com/Job/jobs.htm?sc.keyword={kw}&fromAge=3"
        attempts = 0
        while attempts < 3:
            attempts += 1
            print(f"🔍 Quét: {kw} (Lần {attempts})...")
            
            payload = {
                'api_key': SCRAPER_API_KEY,
                'url': target_url,
                'render': 'false',   # Tắt render JS để tiết kiệm credit và tránh lỗi 500
                'premium': 'true', 
                'country_code': 'us'
            }

            try:
                response = requests.get('http://api.scraperapi.com', params=payload, timeout=60)
                
                # 1. Kiểm tra Credit Âm (Lỗi 403)
                if response.status_code == 403:
                    print("❌ Lỗi 403: Hết credit ScraperAPI hoặc Key sai. Vui lòng kiểm tra số dư.")
                    return # Dừng toàn bộ chương trình

                # 2. Kiểm tra Lỗi Server (Lỗi 500)
                if response.status_code != 200:
                    wait_time = attempts * 10
                    print(f"⚠️ API báo lỗi {response.status_code}. Thử lại sau {wait_time}s...")
                    time.sleep(wait_time)
                    continue

                soup = BeautifulSoup(response.text, 'html.parser')
                listings = soup.find_all(['li', 'div'], {'data-test': 'jobListing'})
                
                count = 0
                for item in listings:
                    try:
                        title_el = item.find('a', {'data-test': 'job-title'})
                        if not title_el: continue
                        
                        title = title_el.get_text(strip=True)
                        link = title_el['href']
                        if not link.startswith('http'): 
                            link = "https://www.glassdoor.com" + link
                        
                        # Selector linh hoạt cho Tên công ty
                        company = "N/A"
                        company_el = item.find('span', {'class': 'EmployerProfile_employerName__D_zzf'})
                        if not company_el:
                            company_el = item.find('div', {'class': 'job-search-8vbe7v'})
                        if company_el:
                            company = company_el.get_text(strip=True).split('\n')[0].replace('★', '').strip()
                        
                        salary_el = item.find('div', {'data-test': 'detailSalary'})
                        salary = salary_el.get_text(strip=True).replace('(Glassdoor Est.)', '').strip() if salary_el else ""

                        all_jobs.append({
                            "Title": title,
                            "Company": company,
                            "Salary": salary,
                            "Link": link,
                            "Keyword": kw,
                            "Date": current_date
                        })
                        count += 1
                    except:
                        continue
                
                if count > 0:
                    print(f"✅ Lấy được {count} jobs cho '{kw}'")
                    break # Thoát vòng lặp retry nếu thành công
                else:
                    print(f"⚠️ Trang trống cho '{kw}'. Thử lại...")
                    time.sleep(5)
                
            except Exception as e:
                print(f"❗ Lỗi kết nối: {e}")
                time.sleep(10)

    if all_jobs:
        file_name = f"Glassdoor_Jobs_{current_date}.xlsx"
        df = pd.DataFrame(all_jobs)
        df.to_excel(file_name, index=False, engine='openpyxl')
        
        print(f"📊 Đã lưu {len(all_jobs)} jobs vào {file_name}")
        
        # Upload và gửi thông báo
        file_link = upload_to_catbox(file_name)
        send_telegram(f"✅ <b>[Glassdoor]</b> Tìm thấy {len(all_jobs)} jobs mới!", file_name)
        send_to_teams(len(all_jobs), file_link)
        print("🏁 Hoàn tất!")
    else:
        print("❌ Không tìm thấy dữ liệu nào.")
        send_telegram("❌ Glassdoor: Không tìm thấy job mới nào hôm nay (Kiểm tra lại Credit/API).")

if __name__ == "__main__":
    run_scraper()