import cloudscraper
from bs4 import BeautifulSoup
import pandas as pd
import time

def run_scraper():
    # Tạo một instance scraper có khả năng giải mã Cloudflare
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        }
    )

    url = "https://www.glassdoor.com/Job/vietnam-python-developer-jobs-SRCH_IL.0,7_IN251_KO8,24.htm"
    
    print(f"Đang gửi yêu cầu 'vượt rào' tới Glassdoor...")
    
    try:
        # Gửi request lấy HTML
        response = scraper.get(url)
        
        if response.status_code == 200:
            print("Kết nối thành công! Đang bóc tách dữ liệu...")
            soup = BeautifulSoup(response.text, 'html.parser')
            
            jobs = []
            # Tìm các thẻ li chứa công việc
            job_listings = soup.select('li[data-test="jobListing"]')
            
            for job in job_listings:
                try:
                    title = job.select_one('[data-test="job-title"]').get_text()
                    company = job.select_one('[data-test="employer-short-name"]').get_text()
                    jobs.append({"Title": title, "Company": company})
                except:
                    continue
            
            if jobs:
                df = pd.DataFrame(jobs)
                df.to_csv("glassdoor_jobs.csv", index=False, encoding="utf-8-sig")
                print(f"Thành công! Đã lấy được {len(jobs)} công việc.")
            else:
                print("Không tìm thấy job nào. Có thể cấu hình HTML đã thay đổi.")
        else:
            print(f"Bị chặn bởi Cloudflare. Mã lỗi: {response.status_code}")
            # Lưu log để debug
            with open("error_log.html", "w", encoding="utf-8") as f:
                f.write(response.text)

    except Exception as e:
        print(f"Lỗi hệ thống: {e}")

if __name__ == "__main__":
    run_scraper()