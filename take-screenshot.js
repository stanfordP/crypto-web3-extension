const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  
  // Load the install.html file
  await page.goto('file://' + process.cwd() + '/docs/install.html');
  
  // Wait for page to load fully
  await page.waitForLoadState('networkidle');
  
  // Take screenshot of the entire page
  await page.screenshot({ 
    path: 'docs/install-page-screenshot.png', 
    fullPage: true 
  });
  
  // Take a focused screenshot of the prerequisites section
  const prereqSection = await page.$('.prereq-grid');
  if (prereqSection) {
    await prereqSection.screenshot({ path: 'docs/prerequisites-screenshot.png' });
  }
  
  // Take a focused screenshot of the alert section
  await page.screenshot({ 
    path: 'docs/alerts-screenshot.png',
    clip: { x: 0, y: 150, width: 1280, height: 400 }
  });
  
  await browser.close();
  console.log('Screenshots saved!');
})();
