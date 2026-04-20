import requests
from bs4 import BeautifulSoup
import pandas as pd
import os

def run_scraper():
    # Lấy API Key từ môi trường (GitHub Secrets)
    api_key = os.environ.get('SCRAPER_API_KEY')
    target_url = "https://www.glassdoor.com/Job/vietnam-python-developer-jobs-SRCH_IL.0,7_IN251_KO8,24.htm"
    
    # Cấu hình ScraperAPI
    # render=true để nó tự giải quyết Javascript/Cloudflare cho mình
    proxy_url = f"http://api.scraperapi.com?api_key={api_key}&url={target_url}&render=true"

    print("Đang yêu cầu ScraperAPI xuyên phá Cloudflare...")
    
    try:
        response = requests.get(proxy_url, timeout=60)
        
        if response.status_code == 200:
            print("Xuyên phá thành công! Đang lấy dữ liệu...")
            soup = BeautifulSoup(response.text, 'html.parser')
            
            jobs = []
            job_listings = soup.select('li[data-test="jobListing"]')
            
            for job in job_listings:
                try:
                    title = job.select_one('[data-test="job-title"]').get_text()
                    company = job.select_one('[data-test="employer-short-name"]').get_text()
                    jobs.append({"Title": title, "Company": company})
                except: continue
            
            if jobs:
                df = pd.DataFrame(jobs)
                df.to_csv("glassdoor_jobs.csv", index=False, encoding="utf-8-sig")
                print(f"Hoàn tất! Đã lấy {len(jobs)} công việc.")
            else:
                print("Không tìm thấy dữ liệu. Có thể selector HTML đã đổi.")
        else:
            print(f"Thất bại. Mã lỗi từ API: {response.status_code}")

    except Exception as e:
        print(f"Lỗi: {e}")

if __name__ == "__main__":
    run_scraper()