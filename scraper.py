options = uc.ChromeOptions()
options.add_argument('--headless') # Quan trọng nhất
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')
options.add_argument('--disable-gpu')
# Thêm user-agent giả để bớt bị chặn
options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36')

driver = uc.Chrome(options=options)