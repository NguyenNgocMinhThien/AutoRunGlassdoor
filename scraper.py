import requests
from bs4 import BeautifulSoup
import pandas as pd
import os

def run_scraper():
    # Lấy API Key từ GitHub Secrets
    api_key = os.environ.get('SCRAPER_API_KEY')
    target_url = "https://www.glassdoor.com/Job/vietnam-python-developer-jobs-SRCH_IL.0,7_IN251_KO8,24.htm"
    
    # Cấu hình API để render JavaScript và lách Cloudflare
    payload = {
        'api_key': api_key,
        'url': target_url,
        'render': 'true'
    }

    print("Đang yêu cầu ScraperAPI xuyên phá Cloudflare...")
    
    try:
        response = requests.get('http://api.scraperapi.com', params=payload, timeout=60)
        
        if response.status_code == 200:
            print("Xuyên phá thành công! Đang bóc tách dữ liệu...")
            soup = BeautifulSoup(response.text, 'html.parser')
            
            jobs = []
            # Tìm danh sách công việc dựa trên cấu trúc HTML của Glassdoor
            job_listings = soup.select('li[data-test="jobListing"]')
            
            for job in job_listings:
                try:
                    title = job.select_one('[data-test="job-title"]').get_text(strip=True)
                    company = job.select_one('[data-test="employer-short-name"]').get_text(strip=True)
                    jobs.append({"Title": title, "Company": company})
                except:
                    continue
            
            if jobs:
                df = pd.DataFrame(jobs)
                df.to_csv("glassdoor_jobs.csv", index=False, encoding="utf-8-sig")
                print(f"Hoàn tất! Đã lưu {len(jobs)} công việc vào file CSV.")
            else:
                print("Lỗi: Không tìm thấy thẻ công việc nào. Có thể selector HTML đã thay đổi.")
        else:
            print(f"ScraperAPI báo lỗi: {response.status_code}")

    except Exception as e:
        print(f"Lỗi hệ thống: {e}")

if __name__ == "__main__":
    run_scraper()