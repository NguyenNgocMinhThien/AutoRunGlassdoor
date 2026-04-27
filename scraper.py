import requests
from bs4 import BeautifulSoup
import pandas as pd
import os

def run_scraper():
    api_key = os.environ.get('SCRAPER_API_KEY')
    target_url = "https://www.glassdoor.com/Job/vietnam-python-developer-jobs-SRCH_IL.0,7_IN251_KO8,24.htm"
    
    # Sử dụng các tham số tối ưu để vượt qua lớp bảo vệ của Glassdoor
    payload = {
        'api_key': api_key, 
        'url': target_url, 
        'render': 'true',
        'premium': 'true',
        'country_code': 'us'
    }

    print("🚀 Đang yêu cầu ScraperAPI xuyên phá Glassdoor...")
    try:
        response = requests.get('http://api.scraperapi.com', params=payload, timeout=60)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            jobs = []
            
            # Bộ selector đa năng mới nhất
            listings = soup.find_all(['li', 'div'], {'data-test': 'jobListing'})
            
            for item in listings:
                try:
                    # Tìm tiêu đề công việc (thử nhiều trường hợp)
                    title_elem = item.find('a', {'data-test': 'job-title'}) or item.select_one('[class*="job-title"]')
                    # Tìm tên công ty
                    company_elem = item.find('div', {'data-test': 'employer-short-name'}) or item.select_one('[class*="employer-name"]')
                    
                    if title_elem:
                        title = title_elem.get_text(strip=True)
                        company = company_elem.get_text(strip=True) if company_elem else "N/A"
                        # Loại bỏ rating (ví dụ 4.2*) nếu có dính vào tên công ty
                        company = company.split('\n')[0].split('★')[0].strip()
                        
                        jobs.append({"Title": title, "Company": company})
                        print(f"✨ Tìm thấy: {title} @ {company}")
                except: continue
            
            if jobs:
                df = pd.DataFrame(jobs)
                df.to_csv("glassdoor_jobs.csv", index=False, encoding="utf-8-sig")
                print(f"✅ Hoàn tất! Đã lưu {len(jobs)} công việc.")
            else:
                print("❌ Vẫn không tìm thấy thẻ job. Có thể cần bật chế độ Render JS mạnh hơn.")
        else:
            print(f"⚠️ API lỗi mã: {response.status_code}")
    except Exception as e:
        print(f"❗ Lỗi hệ thống: {e}")

if __name__ == "__main__":
    run_scraper()