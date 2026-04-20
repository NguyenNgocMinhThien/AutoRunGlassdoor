import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
import time
import pandas as pd
import os

def run_scraper():
    # 1. Cấu hình Options cực kỳ quan trọng cho GitHub Action
    options = uc.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--disable-popup-blocking')
    # Giả lập user-agent để qua mặt Cloudflare
    options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36')

    try:
        print("Đang khởi tạo trình duyệt...")
        driver = uc.Chrome(options=options)
        
        # 2. Truy cập Glassdoor
        # Lưu ý: Glassdoor rất nhạy cảm, bạn nên dùng link trực tiếp đến một tìm kiếm cụ thể
        url = "https://www.glassdoor.com/Job/vietnam-python-developer-jobs-SRCH_IL.0,7_IN251_KO8,24.htm"
        print(f"Đang truy cập: {url}")
        driver.get(url)
        
        # Chờ một chút để trang load xong
        time.sleep(10) 

        # 3. Logic lấy dữ liệu (Ví dụ đơn giản lấy tiêu đề các job đầu tiên)
        jobs = []
        # Selector này có thể thay đổi tùy theo giao diện Glassdoor thời điểm đó
        job_listings = driver.find_elements(By.CSS_SELECTOR, 'li[data-test="jobListing"]')
        
        for job in job_listings[:5]: # Thử nghiệm lấy 5 cái đầu tiên
            try:
                title = job.find_element(By.CSS_SELECTOR, '[data-test="job-title"]').text
                company = job.find_element(By.CSS_SELECTOR, '[data-test="employer-short-name"]').text
                jobs.append({"Title": title, "Company": company})
                print(f"Lấy được: {title} tại {company}")
            except:
                continue

        # 4. Lưu dữ liệu
        if jobs:
            df = pd.DataFrame(jobs)
            df.to_csv("glassdoor_jobs.csv", index=False, encoding="utf-8-sig")
            print("Đã lưu file glassdoor_jobs.csv")
        else:
            print("Không tìm thấy dữ liệu nào. Có thể bị Cloudflare chặn.")

    except Exception as e:
        print(f"Đã xảy ra lỗi: {e}")
    
    finally:
        if 'driver' in locals():
            driver.quit()
            print("Đã đóng trình duyệt.")

if __name__ == "__main__":
    run_scraper()