import requests
from bs4 import BeautifulSoup
import pandas as pd
import os

def run_scraper():
    api_key = os.environ.get('SCRAPER_API_KEY')
    target_url = "https://www.glassdoor.com/Job/vietnam-python-developer-jobs-SRCH_IL.0,7_IN251_KO8,24.htm"
    
    # Dùng cấu hình cơ bản để tiết kiệm credit
    payload = {'api_key': api_key, 'url': target_url, 'render': 'true'}

    print("🚀 Đang yêu cầu ScraperAPI...")
    try:
        response = requests.get('http://api.scraperapi.com', params=payload, timeout=60)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            jobs = []
            # Selector này nhắm vào cấu hình mới nhất của Glassdoor
            listings = soup.find_all(['li', 'div'], {'data-test': 'jobListing'})
            for item in listings:
                try:
                    title = item.find('a', {'data-test': 'job-title'}).get_text(strip=True)
                    company = item.find('div', {'data-test': 'employer-short-name'}).get_text(strip=True)
                    jobs.append({"Title": title, "Company": company})
                except: continue
            
            if jobs:
                pd.DataFrame(jobs).to_csv("glassdoor_jobs.csv", index=False, encoding="utf-8-sig")
                print(f"✅ Thành công! Tìm thấy {len(jobs)} việc.")
            else: print("❌ Không tìm thấy job. Kiểm tra lại HTML.")
        else: print(f"⚠️ API lỗi mã: {response.status_code}")
    except Exception as e: print(f"❗ Lỗi: {e}")

if __name__ == "__main__":
    run_scraper()