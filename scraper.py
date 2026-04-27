import requests
from bs4 import BeautifulSoup
import pandas as pd
import os

def run_scraper():
    # 1. Lấy API Key từ GitHub Secrets (Đã cài đặt trong Settings của Repo)
    api_key = os.environ.get('SCRAPER_API_KEY')
    target_url = "https://www.glassdoor.com/Job/vietnam-python-developer-jobs-SRCH_IL.0,7_IN251_KO8,24.htm"
    
    # 2. Cấu hình ScraperAPI nâng cao
    # 'render': 'true' để thực thi JavaScript
    # 'premium': 'true' để dùng IP dân dụng (Residential Proxy) lách Cloudflare
    payload = {
        'api_key': api_key,
        'url': target_url,
        'render': 'true',
        'premium': 'true',
        'country_code': 'us'
    }

    print("🚀 Đang yêu cầu ScraperAPI xuyên phá Cloudflare bằng IP dân dụng...")
    
    try:
        response = requests.get('http://api.scraperapi.com', params=payload, timeout=60)
        
        if response.status_code == 200:
            print("✅ Xuyên phá thành công! Đang bóc tách dữ liệu...")
            soup = BeautifulSoup(response.text, 'html.parser')
            
            jobs = []
            
            # 3. Sử dụng bộ Selector linh hoạt để thích ứng với giao diện Glassdoor
            # Tìm tất cả các thẻ có khả năng là khung bao của 1 job
            job_listings = soup.find_all(['li', 'div'], {'data-test': 'jobListing'})
            
            if not job_listings:
                # Phương án dự phòng nếu data-test bị thay đổi
                job_listings = soup.select('li[class*="JobCard"]')

            for job in job_listings:
                try:
                    # Lấy tiêu đề công việc
                    title_elem = job.find('a', {'data-test': 'job-title'}) or \
                                 job.select_one('.job-title') or \
                                 job.select_one('a[class*="JobCard_jobTitle"]')
                    
                    # Lấy tên công ty
                    company_elem = job.find('div', {'data-test': 'employer-short-name'}) or \
                                   job.select_one('.employer-name') or \
                                   job.select_one('span[class*="JobCard_employerName"]')

                    if title_elem:
                        title = title_elem.get_text(strip=True)
                        company = company_elem.get_text(strip=True) if company_elem else "N/A"
                        
                        # Làm sạch tên công ty (loại bỏ Rating như 4.2 ★)
                        company = company.split('\n')[0].split('★')[0].strip()
                        
                        jobs.append({"Title": title, "Company": company})
                        print(f"✨ Tìm thấy: {title} tại {company}")
                except Exception:
                    continue
            
            # 4. Lưu kết quả ra file CSV
            if jobs:
                df = pd.DataFrame(jobs)
                df.to_csv("glassdoor_jobs.csv", index=False, encoding="utf-8-sig")
                print(f"📊 Hoàn tất! Đã lưu {len(jobs)} công việc vào file glassdoor_jobs.csv.")
            else:
                print("❌ Lỗi: Không tìm thấy dữ liệu. Có thể selector HTML đã thay đổi.")
                # Lưu file debug để kiểm tra nếu cần
                with open("debug_page.html", "w", encoding="utf-8") as f:
                    f.write(response.text)
        else:
            print(f"⚠️ ScraperAPI báo lỗi mã: {response.status_code}")
            print("Hãy kiểm tra lại số dư credits hoặc API Key của bạn.")

    except Exception as e:
        print(f"❗ Lỗi hệ thống: {e}")

if __name__ == "__main__":
    run_scraper()