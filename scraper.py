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

# --- HÀM HỖ TRỢ (GIỐNG LOGIC JS) ---

def upload_to_catbox(file_path):
    """Tải file lên Litterbox (tồn tại 24h) để lấy link cho Teams"""
    try:
        url = 'https://litterbox.catbox.moe/resources/internals/api.php'
        with open(file_path, 'rb') as f:
            files = {'fileToUpload': f}
            data = {'reqtype': 'fileupload', 'time': '24h'}
            response = requests.post(url, data=data, files=files)
        return response.text.strip()
    except Exception as e:
        print(f"❌ Lỗi Catbox: {e}")
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
                "actions": [{"type": "Action.OpenUrl", "title": "📥 TẢI FILE EXCEL", "url": file_link}]
            }
        }]
    }
    requests.post(TEAMS_WEBHOOK, json=card)

def send_telegram(message, file_path=None):
    """Gửi thông báo và file Excel qua Telegram"""
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID: return
    base_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
    
    # Gửi tin nhắn text
    requests.post(f"{base_url}/sendMessage", data={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "HTML"})
    
    # Gửi file Excel
    if file_path and os.path.exists(file_path):
        with open(file_path, 'rb') as f:
            requests.post(f"{base_url}/sendDocument", data={"chat_id": TELEGRAM_CHAT_ID}, files={"document": f})

# --- HÀM CHẠY CHÍNH ---

def run_scraper():
    print("🚀 Khởi động Glassdoor Scraper...")
    all_jobs = []
    current_date = datetime.now().strftime("%Y-%m-%d")

    for kw in KEYWORDS:
        # URL tìm kiếm (Ví dụ vùng Vancouver, BC)
        target_url = f"https://www.glassdoor.com/Job/jobs.htm?sc.keyword={kw}&fromAge=3"
        
        attempts = 0
        while attempts < 3:
            attempts += 1
            print(f"🔍 Quét: {kw} (Lần {attempts})...")
            
            payload = {
                'api_key': SCRAPER_API_KEY,
                'url': target_url,
                'render': 'true',
                'premium': 'true',
                'country_code': 'us'
            }

            try:
                response = requests.get('http://api.scraperapi.com', params=payload, timeout=60)
                if response.status_code != 200:
                    print(f"⚠️ API lỗi {response.status_code}. Thử lại...")
                    continue

                soup = BeautifulSoup(response.text, 'html.parser')
                listings = soup.find_all(['li', 'div'], {'data-test': 'jobListing'})
                
                count = 0
                for item in listings:
    try:
        # 1. Tìm Tiêu đề
        title_el = item.find('a', {'data-test': 'job-title'})
        title = title_el.get_text(strip=True) if title_el else "N/A"
        
        # 2. Tìm Tên công ty (Cập nhật selector mới nhất)
        # Thường nằm trong thẻ div hoặc span ngay trên tiêu đề
        company_el = item.find('span', {'class': 'EmployerProfile_employerName__D_zzf'}) 
        if not company_el:
            company_el = item.find('div', {'class': 'job-search-8vbe7v'}) # Class dự phòng
            
        company = company_el.get_text(strip=True).split('\n')[0] if company_el else "N/A"
        
        # Loại bỏ các ký tự rác như sao đánh giá (★)
        company = company.replace('★', '').strip()
                        
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
                    except: continue
                
                print(f"✅ Lấy được {count} jobs cho '{kw}'")
                if count > 0: break 
                
            except Exception as e:
                print(f"❗ Lỗi hệ thống: {e}")
                time.sleep(5)

    if all_jobs:
        # XUẤT FILE EXCEL (.xlsx)
        file_name = f"Glassdoor_Jobs_{current_date}.xlsx"
        df = pd.DataFrame(all_jobs)
        # Sử dụng engine openpyxl để ghi file Excel
        df.to_excel(file_name, index=False, engine='openpyxl')
        print(f"📊 Đã lưu {len(all_jobs)} jobs vào {file_name}")

        # THÔNG BÁO
        file_link = upload_to_catbox(file_name)
        send_telegram(f"✅ <b>[Glassdoor]</b> Tìm thấy {len(all_jobs)} jobs mới!", file_name)
        send_to_teams(len(all_jobs), file_link)
        print("🏁 Hoàn tất!")
    else:
        print("❌ Không tìm thấy job nào.")
        send_telegram("❌ Glassdoor: Không tìm thấy job mới nào hôm nay.")

if __name__ == "__main__":
    run_scraper()