// Global variables
let isExtracting = false;
let currentPage = 1;
let totalPages = 1;
let extractedJobs = [];
let extractionConfig = {
  delay: 1000, // Default delay between actions in ms
  maxRetries: 3  // Maximum number of retries for navigation
};

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extract") {
    startExtraction();
    sendResponse({ status: "started" });
  } else if (message.action === "stop") {
    stopExtraction();
    sendResponse({ status: "stopped" });
  }
  return true; // Keep the message channel open for async responses
});

// Function to start the extraction process
async function startExtraction() {
  if (isExtracting) return;
  
  isExtracting = true;
  extractedJobs = [];
  
  // Reset and estimate total pages
  currentPage = 1;
  totalPages = estimateTotalPages();
  
  // Update the background script with initial progress
  updateProgress();
  
  try {
    // First, determine what kind of page we're on
    const pageType = determinePageType();
    
    if (pageType === "job_listing") {
      // Extract data from job listings page
      await extractJobListings();
    } else if (pageType === "job_detail") {
      // Extract data from a single job detail page
      const jobData = extractJobDetail();
      if (jobData) {
        extractedJobs.push(jobData);
        sendJobDataToBackground();
      }
    } else {
      console.log("No job data detected on this page");
      isExtracting = false;
    }
  } catch (error) {
    console.error("Extraction error:", error);
    isExtracting = false;
  }
}

// Function to stop the extraction process
function stopExtraction() {
  isExtracting = false;
}

// Function to determine what type of page we're on
function determinePageType() {
  // Check for common job listing page indicators
  const hasMultipleJobCards = document.querySelectorAll(".job-card, .job-listing, [data-job-id], .job-result-card").length > 1;
  
  // Check for common job detail page indicators
  const hasJobDetailElements = document.querySelector(".job-description, [data-job-detail], #job-description, .jobsearch-JobComponent");
  
  if (hasMultipleJobCards) {
    return "job_listing";
  } else if (hasJobDetailElements) {
    return "job_detail";
  }
  
  // Try to detect based on URL patterns
  const url = window.location.href.toLowerCase();
  if (url.includes("jobs") || url.includes("careers") || url.includes("vacancies")) {
    if (url.includes("job/") || url.includes("position/") || url.includes("posting/")) {
      return "job_detail";
    } else {
      return "job_listing";
    }
  }
  
  return "unknown";
}

// Function to detect which job site we're on
function detectJobSite() {
  const url = window.location.href.toLowerCase();
  const hostname = window.location.hostname.toLowerCase();
  
  if (hostname.includes("indeed") || url.includes("indeed.")) {
    return "indeed";
  } else if (hostname.includes("welcometothejungle") || url.includes("welcometothejungle")) {
    return "welcometothejungle";
  } else if (hostname.includes("apec") || url.includes("apec.")) {
    return "apec";
  } else if (hostname.includes("hellowork") || url.includes("hellowork")) {
    return "hellowork";
  } else if (hostname.includes("linkedin") || url.includes("linkedin")) {
    return "linkedin";
  } else if (hostname.includes("monster") || url.includes("monster")) {
    return "monster";
  } else if (hostname.includes("glassdoor") || url.includes("glassdoor")) {
    return "glassdoor";
  } else if (hostname.includes("pole-emploi") || url.includes("pole-emploi")) {
    return "pole-emploi";
  }
  
  return "generic";
}

// Function to find job items/cards on the page
function findJobItems() {
  // Detect which job board we're on
  const currentSite = detectJobSite();
  console.log("Detected job site:", currentSite);
  
  // Site-specific selectors
  if (currentSite === "indeed") {
    const indeedCards = document.querySelectorAll("li.css-1ac2h1w.eu4oa1w0, .jobsearch-ResultsList > div, .jobCard, div[data-testid='job-card'], [class*='job_']");
    if (indeedCards.length > 0) {
      return Array.from(indeedCards);
    }
  } else if (currentSite === "welcometothejungle") {
    const wttjCards = document.querySelectorAll("li[data-testid='search-results-list-item-wrapper'], div.sc-guWVcn, [data-object-id]");
    if (wttjCards.length > 0) {
      return Array.from(wttjCards);
    }
  } else if (currentSite === "apec") {
    const apecCards = document.querySelectorAll("apec-recherche-resultat, .card.card-offer, [class*='card-offer']");
    if (apecCards.length > 0) {
      return Array.from(apecCards);
    }
  } else if (currentSite === "hellowork") {
    const helloworkCards = document.querySelectorAll("li[data-id-storage-target='item'], .tw-group");
    if (helloworkCards.length > 0) {
      return Array.from(helloworkCards);
    }
  } else if (currentSite === "linkedin") {
    const linkedinCards = document.querySelectorAll(".job-search-card, .jobs-search-results__list-item, .scaffold-layout__list-item");
    if (linkedinCards.length > 0) {
      return Array.from(linkedinCards);
    }
  }
  
  // Try various common selectors for job items
  const selectors = [
    ".job-card",
    ".job-listing",
    "[data-job-id]",
    ".job-result-card",
    ".results-list .result",
    ".vacancy-item",
    ".job-search-card",
    ".jobsearch-ResultsList > div",
    ".job-card-container",
    // Add more generic selectors
    "li.search-result",
    "article.job-item",
    "div.job-offer",
    "[class*='job-card']",
    "[class*='jobCard']",
    "[class*='CardJob']",
    "[class*='card-offer']",
    "[class*='JobCard']",
    "[class*='job_listing']",
    "[class*='job-listing']",
    "[class*='jobListing']"
  ];
  
  for (const selector of selectors) {
    const items = document.querySelectorAll(selector);
    if (items.length > 0) {
      return Array.from(items);
    }
  }
  
  // If no common selectors work, try to find job items by typical structure
  const potentialItems = Array.from(document.querySelectorAll("div, li, article"))
    .filter(el => {
      // Skip tiny elements or very large containers
      if (!el.textContent || el.textContent.length < 20 || el.textContent.length > 3000) {
        return false;
      }
      
      // Check if element contains typical job information
      const text = el.textContent.toLowerCase();
      
      // Look for job title indicators
      const hasJobTitle = text.includes("job title") || 
                           el.querySelector("h1, h2, h3, h4, h5") || 
                           text.includes("développeur") || 
                           text.includes("engineer") || 
                           text.includes("developer") ||
                           text.includes("manager") ||
                           text.includes("director") ||
                           text.includes("analyst") ||
                           text.includes("h/f") ||
                           text.includes("f/h");
      
      // Look for company indicators
      const hasCompany = text.includes("company") || 
                         text.includes("employer") || 
                         text.includes("recruteur") ||
                         text.includes("entreprise");
      
      // Look for location indicators
      const hasLocation = text.includes("location") || 
                         text.includes("city") || 
                         text.includes("remote") || 
                         text.includes("télétravail") ||
                         text.includes("paris") ||
                         text.includes("lyon") ||
                         text.includes("marseille") ||
                         text.includes("bordeaux") ||
                         text.includes("toulouse");
      
      // Look for contract type indicators
      const hasContractType = text.includes("cdi") || 
                             text.includes("cdd") || 
                             text.includes("full-time") || 
                             text.includes("part-time") ||
                             text.includes("temps plein") ||
                             text.includes("temps partiel") ||
                             text.includes("contrat");
      
      return hasJobTitle && (hasCompany || hasLocation || hasContractType);
    });
  
  return potentialItems;
}

// Function to extract basic job data from a job item
function extractBasicJobData(jobItem) {
  const jobData = {
    jobTitle: "",
    companyName: "",
    location: "",
    employmentType: "",
    salaryRange: "",
    jobDescription: "",
    requiredSkills: "",
    experienceRequirements: "",
    educationRequirements: "",
    benefits: "",
    applicationDeadline: "",
    postedDate: "",
    jobUrl: "",
    sourceWebsite: window.location.hostname,
    lastUpdated: new Date().toISOString()
  };
  
  try {
    // Get the site-specific extraction method based on detected job site
    const currentSite = detectJobSite();
    
    // Try site-specific extraction first
    if (currentSite === "indeed") {
      extractIndeedJobData(jobItem, jobData);
    } else if (currentSite === "welcometothejungle") {
      extractWTTJJobData(jobItem, jobData);
    } else if (currentSite === "apec") {
      extractApecJobData(jobItem, jobData);
    } else if (currentSite === "hellowork") {
      extractHelloWorkJobData(jobItem, jobData);
    } else if (currentSite === "linkedin") {
      extractLinkedInJobData(jobItem, jobData);
    }
    
    // Fill in any missing data with generic extraction methods
    if (!jobData.jobTitle) {
      // Extract job title using generic selectors
      jobData.jobTitle = extractTextBySelectors(jobItem, [
        ".job-title", 
        "h1", "h2", "h3", "h4", 
        ".title", 
        "[data-job-title]",
        ".jobTitle",
        "span[title]",
        "[class*='title']",
        "[class*='card-title']",
        "[class*='job-title']",
        "[class*='jobTitle']",
        ".css-1psdjh5 span",
        "div[role='mark']",
        "p.tw-typo-l",
        "p[class*='typo-l']",
        "p[class*='typo-xl']"
      ]);
    }
    
    if (!jobData.companyName) {
      // Extract company name using generic selectors
      jobData.companyName = extractTextBySelectors(jobItem, [
        ".company-name", 
        ".employer", 
        "[data-company]",
        ".companyName",
        ".company",
        "[data-testid='company-name']",
        ".card-offer__company",
        "span[class*='companyName']",
        "p.tw-typo-s",
        "[class*='company']",
        "span.css-1h7lukg",
        "span.wui-text",
        "p[class*='company']"
      ]);
    }
    
    if (!jobData.location) {
      // Extract location using generic selectors
      jobData.location = extractTextBySelectors(jobItem, [
        ".location", 
        ".job-location", 
        "[data-location]",
        ".companyLocation",
        ".workplace",
        "[data-testid='text-location']",
        "div[class*='location']",
        "div[class*='Location']",
        "div.tw-readonly:first-of-type",
        ".tw-tag-secondary-s:first-of-type",
        "[class*='tag'][class*='location']",
        ".css-1restlb"
      ]);
    }
    
    if (!jobData.employmentType) {
      // Extract employment type using generic selectors
      jobData.employmentType = extractTextBySelectors(jobItem, [
        ".employment-type", 
        ".job-type", 
        "[data-job-type]",
        ".metadata-employment-type",
        ".contract-type",
        "div[class*='contract']",
        ".tw-readonly:nth-of-type(2)",
        ".tw-tag-secondary-s:nth-of-type(2)",
        "[class*='contract']",
        "[class*='tag'][class*='contract']",
        "[name='contract']"
      ]);
    }
    
    if (!jobData.salaryRange) {
      // Extract salary range using generic selectors
      jobData.salaryRange = extractTextBySelectors(jobItem, [
        ".salary", 
        ".salary-range", 
        "[data-salary]",
        ".metadata-salary-snippet",
        "[class*='salary']",
        "[class*='Salary']",
        ".tw-tag-attractive-s",
        "[class*='tag'][class*='attractive']",
        "[name='salary']",
        ".css-18z4q2i.eu4oa1w0:first-of-type"
      ]);
    }
    
    if (!jobData.postedDate) {
      // Extract posted date using generic selectors
      jobData.postedDate = extractDate(jobItem, [
        ".date", 
        ".posted-date", 
        "[data-posted-date]",
        ".date-posted",
        ".post-date",
        "[class*='date']",
        "[class*='Date']",
        ".tw-typo-s.tw-text-grey",
        "span[title*='date']",
        "span[title*='Date']",
        "[class*='jobMetadataFooter']"
      ]);
    }
    
    // Extract job description
    if (!jobData.jobDescription) {
      jobData.jobDescription = extractTextBySelectors(jobItem, [
        ".job-description",
        ".description",
        "[data-job-description]",
        ".card-offer__description",
        "ul[style*='list-style-type:circle']",
        "div[class*='snippet']",
        "p.tw-typo-s"
      ]);
    }
    
    // Extract job URL if not already extracted
    if (!jobData.jobUrl) {
      const anchorElement = jobItem.tagName === "A" ? 
        jobItem : 
        jobItem.querySelector("a[href], [data-job-url], a[class*='forwarder']");
        
      if (anchorElement && anchorElement.hasAttribute("href")) {
        const href = anchorElement.getAttribute("href");
        jobData.jobUrl = href.startsWith("http") ? 
          href : 
          new URL(href, window.location.origin).href;
      }
    }
  } catch (error) {
    console.error("Error extracting basic job data:", error);
  }
  
  return jobData;
}

// Indeed-specific extraction
function extractIndeedJobData(jobItem, jobData) {
  // Job title
  const titleEl = jobItem.querySelector(".jobTitle span[id^='jobTitle-'], span[title], h2.jobTitle span");
  if (titleEl) {
    jobData.jobTitle = titleEl.textContent.trim();
  }
  
  // Company name
  const companyEl = jobItem.querySelector("[data-testid='company-name'], .companyName");
  if (companyEl) {
    jobData.companyName = companyEl.textContent.trim();
  }
  
  // Location
  const locationEl = jobItem.querySelector("[data-testid='text-location'], .companyLocation");
  if (locationEl) {
    jobData.location = locationEl.textContent.trim();
  }
  
  // Salary
  const salaryEl = jobItem.querySelector(".salary-snippet-container, [class*='salarySnippet'], [data-testid='attribute_snippet_testid']:first-of-type");
  if (salaryEl) {
    jobData.salaryRange = salaryEl.textContent.trim();
  }
  
  // Employment type
  const typeEl = jobItem.querySelector("[data-testid='attribute_snippet_testid']:nth-of-type(2)");
  if (typeEl) {
    jobData.employmentType = typeEl.textContent.trim().split('+')[0]; // Remove "+1" etc.
  }
  
  // Job description
  const descEl = jobItem.querySelector("[data-testid='jobsnippet_footer'] ul, .job-snippet, .summary");
  if (descEl) {
    jobData.jobDescription = descEl.textContent.trim();
  }
  
  // Posted date
  const dateEl = jobItem.querySelector("[data-testid='myJobsStateDate'], .date");
  if (dateEl) {
    jobData.postedDate = dateEl.textContent.trim();
  }
  
  // URL
  const linkEl = jobItem.querySelector("a[id^='sj_'], a[data-jk], h2.jobTitle a");
  if (linkEl && linkEl.hasAttribute("href")) {
    const href = linkEl.getAttribute("href");
    jobData.jobUrl = href.startsWith("http") ? href : new URL(href, window.location.origin).href;
  }
}

// Improved Welcome to the Jungle specific extraction
function extractWTTJJobData(jobItem, jobData) {
    try {
      console.log("Extracting WTTJ job data", jobItem);
      
      // Job title - try multiple selectors
      const titleSelectors = [
        "h4 div[role='mark']", 
        "div[class*='mark']", 
        "[class*='sc-dkkA']", 
        "h4.sc-lizKOf", 
        "a[href*='/jobs/'] h4", 
        "a h4"
      ];
      
      for (const selector of titleSelectors) {
        const titleEl = jobItem.querySelector(selector);
        if (titleEl && titleEl.textContent.trim()) {
          jobData.jobTitle = titleEl.textContent.trim();
          console.log("Found job title:", jobData.jobTitle);
          break;
        }
      }
      
      // If still no title, try getting innerText from the entire item
      if (!jobData.jobTitle && jobItem.innerText) {
        // Look for patterns like "Data Engineer", "Developer", etc.
        const lines = jobItem.innerText.split('\n');
        for (const line of lines) {
          if (line.includes('Data') || 
              line.includes('Engineer') || 
              line.includes('Developer') ||
              line.includes('Manager') || 
              line.includes('Designer') ||
              (line.length > 5 && line.length < 50)) {
            jobData.jobTitle = line.trim();
            console.log("Extracted title from text:", jobData.jobTitle);
            break;
          }
        }
      }
      
      // Company name - try multiple approaches
      const companySelectors = [
        "span.sc-lizKOf", 
        "span.wui-text", 
        "[class*='sc-eRdibt']", 
        "img[alt]"
      ];
      
      for (const selector of companySelectors) {
        const companyEl = jobItem.querySelector(selector);
        if (companyEl) {
          if (companyEl.tagName === 'IMG' && companyEl.getAttribute('alt')) {
            jobData.companyName = companyEl.getAttribute('alt').trim();
          } else if (companyEl.textContent.trim()) {
            jobData.companyName = companyEl.textContent.trim();
          }
          
          if (jobData.companyName) {
            console.log("Found company name:", jobData.companyName);
            break;
          }
        }
      }
      
      // Location
      const locationSelectors = [
        "p.sc-lizKOf span", 
        "[name='location']", 
        "span.sc-foEvvu",
        "i[name='location'] + p"
      ];
      
      for (const selector of locationSelectors) {
        const locationEl = jobItem.querySelector(selector);
        if (locationEl && locationEl.textContent.trim()) {
          jobData.location = locationEl.textContent.trim();
          console.log("Found location:", jobData.location);
          break;
        }
      }
      
      // Contract type
      const contractSelectors = [
        "div[class*='kbdlSk'] span", 
        "[name='contract']",
        "i[name='contract'] + span"
      ];
      
      for (const selector of contractSelectors) {
        const contractEl = jobItem.querySelector(selector);
        if (contractEl && contractEl.textContent.trim()) {
          jobData.employmentType = contractEl.textContent.trim();
          console.log("Found employment type:", jobData.employmentType);
          break;
        }
      }
      
      // Salary
      const salarySelectors = [
        "div[class*='kbdlSk']:nth-of-type(3) span", 
        "[name='salary']",
        "i[name='salary'] + span"
      ];
      
      for (const selector of salarySelectors) {
        const salaryEl = jobItem.querySelector(selector);
        if (salaryEl && salaryEl.textContent.trim()) {
          jobData.salaryRange = salaryEl.textContent.trim();
          console.log("Found salary:", jobData.salaryRange);
          break;
        }
      }
      
      // URL
      const linkSelectors = [
        "a.sc-gHCuMn", 
        "a[href*='/jobs/']", 
        "a[href]"
      ];
      
      for (const selector of linkSelectors) {
        const linkEl = jobItem.querySelector(selector);
        if (linkEl && linkEl.hasAttribute("href")) {
          const href = linkEl.getAttribute("href");
          jobData.jobUrl = href.startsWith("http") ? href : new URL(href, window.location.origin).href;
          console.log("Found URL:", jobData.jobUrl);
          break;
        }
      }
      
      // If we get here and we still don't have any data, try a more aggressive approach
      if (!jobData.jobTitle && !jobData.companyName) {
        console.log("Falling back to text-based extraction");
        const allText = jobItem.innerText;
        const lines = allText.split('\n').filter(line => line.trim().length > 0);
        
        if (lines.length >= 2) {
          jobData.jobTitle = lines[0].trim();
          jobData.companyName = lines[1].trim();
          console.log("Extracted from text - Title:", jobData.jobTitle, "Company:", jobData.companyName);
        }
      }
      
      // Set description to indicate this is from WTTJ
      jobData.jobDescription = "Visit the job URL for complete description (WTTJ)";
      
      return true; // Return true if extraction was attempted
    } catch (error) {
      console.error("Error in WTTJ extraction:", error);
      return false;
    }
  }

// Apec specific extraction
function extractApecJobData(jobItem, jobData) {
  // Job title
  const titleEl = jobItem.querySelector("h2.card-title");
  if (titleEl) {
    jobData.jobTitle = titleEl.textContent.trim();
  }
  
  // Company name
  const companyEl = jobItem.querySelector("p.card-offer__company");
  if (companyEl) {
    jobData.companyName = companyEl.textContent.trim();
  }
  
  // Description
  const descEl = jobItem.querySelector("p.card-offer__description");
  if (descEl) {
    jobData.jobDescription = descEl.textContent.trim();
  }
  
  // Get details from the list items
  const details = jobItem.querySelectorAll("ul.details-offer li");
  details.forEach(item => {
    const text = item.textContent.trim();
    const imgAlt = item.querySelector("img")?.getAttribute("alt")?.toLowerCase() || "";
    
    if (imgAlt.includes("salaire") || text.includes("k€")) {
      jobData.salaryRange = text;
    } else if (imgAlt.includes("contrat") || imgAlt.includes("bag")) {
      jobData.employmentType = text;
    } else if (imgAlt.includes("localisation") || imgAlt.includes("map")) {
      jobData.location = text;
    } else if (imgAlt.includes("date") || imgAlt.includes("watch")) {
      jobData.postedDate = text;
    }
  });
  
  // URL
  const linkEl = jobItem.closest("a[href]");
  if (linkEl && linkEl.hasAttribute("href")) {
    const href = linkEl.getAttribute("href");
    jobData.jobUrl = href.startsWith("http") ? href : new URL(href, window.location.origin).href;
  }
}

// Hellowork specific extraction
function extractHelloWorkJobData(jobItem, jobData) {
  // Job title
  const titleEl = jobItem.querySelector("p.tw-typo-l, p.tw-typo-xl, h3 p");
  if (titleEl) {
    jobData.jobTitle = titleEl.textContent.trim();
  }
  
  // Company name
  const companyEl = jobItem.querySelector("p.tw-typo-s, h3 p:last-child");
  if (companyEl) {
    jobData.companyName = companyEl.textContent.trim();
  }
  
  // Get all tags
  const tags = jobItem.querySelectorAll(".tw-readonly, .tw-tag-secondary-s, .tw-tag-attractive-s");
  if (tags.length >= 1) {
    jobData.location = tags[0].textContent.trim();
  }
  if (tags.length >= 2) {
    jobData.employmentType = tags[1].textContent.trim();
  }
  if (tags.length >= 3) {
    jobData.salaryRange = tags[2].textContent.trim();
  }
  
  // Description
  const descEl = jobItem.querySelector("div.tw-typo-s p");
  if (descEl) {
    jobData.jobDescription = descEl.textContent.trim();
  }
  
  // Posted date
  const dateEl = jobItem.querySelector(".tw-typo-s.tw-text-grey");
  if (dateEl) {
    jobData.postedDate = dateEl.textContent.trim();
  }
  
  // URL
  const linkEl = jobItem.querySelector("a[href], a[data-turbo='false']");
  if (linkEl && linkEl.hasAttribute("href")) {
    const href = linkEl.getAttribute("href");
    jobData.jobUrl = href.startsWith("http") ? href : new URL(href, window.location.origin).href;
  }
}

// LinkedIn specific extraction
function extractLinkedInJobData(jobItem, jobData) {
  // Job title
  const titleEl = jobItem.querySelector(".job-card-list__title, .base-search-card__title, h3.base-result-card__title");
  if (titleEl) {
    jobData.jobTitle = titleEl.textContent.trim();
  }
  
  // Company name
  const companyEl = jobItem.querySelector(".job-card-container__company-name, .base-search-card__subtitle, h4.base-result-card__subtitle");
  if (companyEl) {
    jobData.companyName = companyEl.textContent.trim();
  }
  
  // Location
  const locationEl = jobItem.querySelector(".job-card-container__metadata-wrapper, .job-search-card__location, .base-search-card__metadata");
  if (locationEl) {
    jobData.location = locationEl.textContent.trim().split('·')[0].trim();
  }
  
  // Posted date
  const dateEl = jobItem.querySelector(".job-card-container__footer-time-ago, .job-search-card__listdate, .base-result-card__metadata-info");
  if (dateEl) {
    jobData.postedDate = dateEl.textContent.trim();
  }
  
  // URL
  const linkEl = jobItem.querySelector("a");
  if (linkEl && linkEl.hasAttribute("href")) {
    const href = linkEl.getAttribute("href");
    jobData.jobUrl = href.startsWith("http") ? href : new URL(href, window.location.origin).href;
  }
}

// Helper function to extract text by trying multiple selectors
function extractTextBySelectors(element, selectors) {
  // First try direct selectors
  for (const selector of selectors) {
    try {
      const elements = element.querySelectorAll(selector);
      if (elements.length > 0) {
        // If multiple elements match, take the first non-empty one
        for (const el of elements) {
          if (el && el.textContent.trim()) {
            return el.textContent.trim();
          }
        }
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  // If no selector worked, try to find text by keyword in class or id attributes
  const keywords = selectors.map(s => s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase());
  
  for (const child of element.querySelectorAll("*")) {
    const className = (typeof child.className === 'string' ? child.className : '').toLowerCase();
    const id = child.id?.toLowerCase() || "";
    const text = child.textContent.trim();
    
    if (text && text.length > 0 && text.length < 200) {  // Reasonable length for a field
      // Check if any keyword is in the class or id
      if (keywords.some(kw => {
        return (className && className.includes(kw)) || 
               (id && id.includes(kw)) || 
               (child.getAttribute && 
                child.getAttribute('data-testid') && 
                child.getAttribute('data-testid').toLowerCase().includes(kw))
      })) {
        return text;
      }
    }
  }
  
  // Try to find elements by approximate text analysis for common patterns
  const allTextElements = Array.from(element.querySelectorAll("p, span, div, h1, h2, h3, h4, h5, li"))
    .filter(el => {
      const text = el.textContent.trim();
      if (!text || text.length > 200 || text.length < 2) return false;
      
      // Check for patterns that might indicate specific data
      const lowText = text.toLowerCase();
      
      if (selectors.some(s => s.includes("title") || s.includes("Title"))) {
        // For job titles, look for patterns like "Engineer", "Developer", etc.
        return (lowText.includes("engineer") || 
                lowText.includes("developer") ||
                lowText.includes("analyst") ||
                lowText.includes("manager") ||
                lowText.includes("director") ||
                lowText.includes("specialist") ||
                lowText.includes("h/f") ||
                lowText.includes("f/h") ||
                lowText.includes("m/f"));
      }
      
      if (selectors.some(s => s.includes("company") || s.includes("Company"))) {
        // For company names, check if it's capitalized and not too long
        return text.length < 50 && /^[A-Z]/.test(text) && !lowText.includes("salary");
      }
      
      if (selectors.some(s => s.includes("location") || s.includes("Location"))) {
        // For locations, look for city patterns or postal codes
        return (/[A-Z][a-z]+ -/.test(text) || 
                /\d{5}/.test(text) || 
                /[A-Z][a-z]+,/.test(text));
      }
      
      if (selectors.some(s => s.includes("salary") || s.includes("Salary"))) {
        // For salaries, look for currency symbols or number patterns
        return (/€|£|\$|USD|EUR|GBP/.test(text) || 
                /\d+k|\d+K|\d+,\d+/.test(text) ||
                /\d+ - \d+/.test(text));
      }
      
      if (selectors.some(s => s.includes("contract") || s.includes("employment"))) {
        // For employment type, look for common contract terms
        return (/CDI|CDD|CTT|interim|intérim|full.?time|part.?time|temps.?plein|temps.?partiel|contrat/.test(lowText));
      }
      
      return false;
    });
  
  // Return the most likely match based on the context
  if (allTextElements.length > 0) {
    if (selectors.some(s => s.includes("title") || s.includes("Title"))) {
      // For job titles, prefer h1-h5 elements
      const headings = allTextElements.filter(el => /^H[1-5]$/.test(el.tagName));
      if (headings.length > 0) return headings[0].textContent.trim();
    }
    
    return allTextElements[0].textContent.trim();
  }
  
  return "";
}

// Function to extract and format a date
function extractDate(element, selectors) {
  const dateText = extractTextBySelectors(element, selectors);
  if (!dateText) return "";
  
  // Clean up the date text - remove any prefixes like "Posted:", "Date:", etc.
  const cleanDateText = dateText.replace(/^(posted|date|published|publié|posté|mise à jour|employer actif|il y a)(:|\s)+/i, "").trim();
  
  // Try to parse relative dates in English (e.g., "Posted 3 days ago")
  if (cleanDateText.toLowerCase().includes("ago") || 
      cleanDateText.toLowerCase().includes("hour") || 
      cleanDateText.toLowerCase().includes("day") || 
      cleanDateText.toLowerCase().includes("week") || 
      cleanDateText.toLowerCase().includes("month")) {
      
    const now = new Date();
    const matches = cleanDateText.match(/\d+/);
    
    if (matches && matches.length > 0) {
      const amount = parseInt(matches[0]);
      
      if (cleanDateText.includes("minute")) {
        now.setMinutes(now.getMinutes() - amount);
        return now.toISOString().split("T")[0];
      } else if (cleanDateText.includes("hour")) {
        now.setHours(now.getHours() - amount);
        return now.toISOString().split("T")[0];
      } else if (cleanDateText.includes("day")) {
        now.setDate(now.getDate() - amount);
        return now.toISOString().split("T")[0];
      } else if (cleanDateText.includes("week")) {
        now.setDate(now.getDate() - (amount * 7));
        return now.toISOString().split("T")[0];
      } else if (cleanDateText.includes("month")) {
        now.setMonth(now.getMonth() - amount);
        return now.toISOString().split("T")[0];
      }
    }
  }
  
  // Try to parse relative dates in French (e.g., "il y a 3 jours")
  if (cleanDateText.toLowerCase().includes("il y a")) {
    const now = new Date();
    const matches = cleanDateText.match(/\d+/);
    
    if (matches && matches.length > 0) {
      const amount = parseInt(matches[0]);
      
      if (cleanDateText.includes("minute")) {
        now.setMinutes(now.getMinutes() - amount);
        return now.toISOString().split("T")[0];
      } else if (cleanDateText.includes("heure")) {
        now.setHours(now.getHours() - amount);
        return now.toISOString().split("T")[0];
      } else if (cleanDateText.includes("jour")) {
        now.setDate(now.getDate() - amount);
        return now.toISOString().split("T")[0];
      } else if (cleanDateText.includes("semaine")) {
        now.setDate(now.getDate() - (amount * 7));
        return now.toISOString().split("T")[0];
      } else if (cleanDateText.includes("mois")) {
        now.setMonth(now.getMonth() - amount);
        return now.toISOString().split("T")[0];
      }
    }
  }
  
  // Check for French date formats (e.g., "03/04/2025" for April 3rd, 2025)
  const frenchDateRegex = /(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/;
  const frenchDateMatch = cleanDateText.match(frenchDateRegex);
  
  if (frenchDateMatch) {
    let day = parseInt(frenchDateMatch[1]);
    let month = parseInt(frenchDateMatch[2]) - 1; // JS months are 0-indexed
    let year = parseInt(frenchDateMatch[3]);
    
    // Handle 2-digit years
    if (year < 100) {
      year += 2000;
    }
    
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }
  
  // Try to parse various date formats
  try {
    // Handle common date strings
    if (cleanDateText.match(/^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}$/i)) {
      const date = new Date(cleanDateText);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    }
    
    // Handle French month names
    const frMonthMap = {
      'janvier': 'January',
      'février': 'February', 
      'mars': 'March',
      'avril': 'April',
      'mai': 'May',
      'juin': 'June',
      'juillet': 'July',
      'août': 'August',
      'septembre': 'September',
      'octobre': 'October',
      'novembre': 'November',
      'décembre': 'December'
    };
    
    let modifiedDateText = cleanDateText.toLowerCase();
    for (const [fr, en] of Object.entries(frMonthMap)) {
      if (modifiedDateText.includes(fr)) {
        modifiedDateText = modifiedDateText.replace(fr, en);
        break;
      }
    }
    
    const date = new Date(modifiedDateText);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  } catch (e) {
    // If date parsing fails, return the original text
    console.log("Date parsing error:", e);
    return cleanDateText;
  }
  
  return cleanDateText;
}

// Improved function to estimate total pages for WTTJ
function estimateTotalPages() {
    // Detect which job site we're on
    const currentSite = detectJobSite();
    
    // Welcome to the Jungle specific pagination detection
    if (currentSite === "welcometothejungle") {
      // First try to find the last page number
      const paginationItems = document.querySelectorAll("nav[aria-label='Pagination'] ul li a");
      if (paginationItems.length > 0) {
        let maxPage = 1;
        
        // Look for the last numbered page
        paginationItems.forEach(item => {
          if (item.textContent && !isNaN(parseInt(item.textContent.trim()))) {
            const pageNum = parseInt(item.textContent.trim());
            if (pageNum > maxPage) {
              maxPage = pageNum;
            }
          }
        });
        
        console.log("WTTJ pagination: Found max page number:", maxPage);
        return maxPage > 1 ? maxPage : 10; // Default to 10 if only low page numbers are visible
      }
      
      // If we can't find pagination, assume there are multiple pages
      return 10;
    }
    
    // [Rest of the existing code for other sites...]
    
    // Site-specific pagination detection
    if (currentSite === "indeed") {
      const pageNavItems = document.querySelectorAll("[data-testid='pagination-page-number'], .css-tvvxwd, nav[role='navigation'] a, .pagination > *");
      if (pageNavItems.length > 0) {
        let maxPage = 1;
        pageNavItems.forEach(item => {
          const pageNum = parseInt(item.textContent.trim());
          if (!isNaN(pageNum) && pageNum > maxPage) {
            maxPage = pageNum;
          }
        });
        return maxPage > 0 ? maxPage : 10; // Indeed often has lots of pages
      }
    } else if (currentSite === "apec") {
      const paginationItems = document.querySelectorAll(".pagination-item, [id^='pagination']");
      if (paginationItems.length > 0) {
        let maxPage = 1;
        paginationItems.forEach(item => {
          const pageNum = parseInt(item.textContent.trim());
          if (!isNaN(pageNum) && pageNum > maxPage) {
            maxPage = pageNum;
          }
        });
        return maxPage > 0 ? maxPage : 5;
      }
    } else if (currentSite === "hellowork") {
      const paginationItems = document.querySelectorAll("[data-cy='pagination'] [aria-label^='Page']");
      if (paginationItems.length > 0) {
        let maxPage = 1;
        paginationItems.forEach(item => {
          const ariaLabel = item.getAttribute("aria-label") || "";
          const pageMatch = ariaLabel.match(/Page\s+(\d+)/);
          if (pageMatch && pageMatch[1]) {
            const pageNum = parseInt(pageMatch[1]);
            if (!isNaN(pageNum) && pageNum > maxPage) {
              maxPage = pageNum;
            }
          }
        });
        return maxPage > 0 ? maxPage : 5;
      }
    }
    
    // Look for pagination elements with generic selectors
    const paginationElements = document.querySelectorAll(".pagination, .page-number, [data-pagination], nav[role='navigation'], .pager, .ais-Pagination");
    
    if (paginationElements.length > 0) {
      // Check for last page indicator
      const lastPageElement = document.querySelector(".pagination__last-page, .last-page, [data-last-page], .ais-Pagination-item--lastPage, [aria-label='Last Page'], [aria-label='Dernière page']");
      if (lastPageElement && lastPageElement.textContent) {
        const lastPage = parseInt(lastPageElement.textContent.trim());
        if (!isNaN(lastPage)) return lastPage;
      }
      
      // Check for a list of page numbers
      const pageLinks = document.querySelectorAll(".page-link, .page-number, [data-page], .ais-Pagination-link, .pagination li a, .pager-item a");
      if (pageLinks.length > 0) {
        let maxPage = 1;
        pageLinks.forEach(link => {
          const pageNumber = parseInt(link.textContent.trim());
          if (!isNaN(pageNumber) && pageNumber > maxPage) {
            maxPage = pageNumber;
          }
        });
        return maxPage > 1 ? maxPage : 5; // Default to 5 if only page 1 is found
      }
    }
    
    // Default to 1 if no pagination is found
    return 1;
  }

// Improved extract job listings function with better handling of WTTJ
async function extractJobListings() {
    while (isExtracting && currentPage <= totalPages) {
      try {
        // Find job cards/items on the current page
        const jobItems = findJobItems();
        
        // If no job items found, break the loop
        if (jobItems.length === 0) {
          console.log("No job items found on page", currentPage);
          break;
        }
        
        console.log(`Found ${jobItems.length} job items on page ${currentPage}`);
        
        // Process each job item to extract data
        for (let i = 0; i < jobItems.length; i++) {
          if (!isExtracting) break;
          
          const jobItem = jobItems[i];
          
          // Create object for job data
          const jobData = {
            jobTitle: "",
            companyName: "",
            location: "",
            employmentType: "",
            salaryRange: "",
            jobDescription: "",
            requiredSkills: "",
            experienceRequirements: "",
            educationRequirements: "",
            benefits: "",
            applicationDeadline: "",
            postedDate: "",
            jobUrl: "",
            sourceWebsite: window.location.hostname,
            lastUpdated: new Date().toISOString()
          };
          
          let extractionSuccessful = false;
          const currentSite = detectJobSite();
          
          // Site-specific extraction
          if (currentSite === "welcometothejungle") {
            console.log(`Processing WTTJ job ${i+1}/${jobItems.length}`);
            extractionSuccessful = extractWTTJJobData(jobItem, jobData);
          } else {
            // Use regular extraction for other sites
            Object.assign(jobData, extractBasicJobData(jobItem));
            extractionSuccessful = true;
            
            // Get additional details if needed
            const detailUrl = getJobDetailUrl(jobItem);
            if (detailUrl && shouldVisitDetailPage()) {
              try {
                console.log(`Extracting details for job ${i+1}/${jobItems.length}`);
                const detailData = await visitAndExtractJobDetail(detailUrl);
                Object.assign(jobData, detailData);
              } catch (error) {
                console.error("Failed to extract detail data:", error);
              }
            }
          }
          
          // Add the job data if we have at least a title and it was successfully extracted
          if (extractionSuccessful && jobData.jobTitle) {
            console.log(`Adding job ${i+1}: ${jobData.jobTitle}`);
            extractedJobs.push(jobData);
            
            // Send data to background script periodically
            if (extractedJobs.length >= 10) {
              console.log(`Sending batch of ${extractedJobs.length} jobs to background`);
              sendJobDataToBackground();
            }
          } else {
            console.warn(`Skipping job ${i+1} - no title or extraction failed`);
          }
          
          // Add a small delay between processing items to avoid overloading
          if (isExtracting) {
            await delay(extractionConfig.delay / 2);
          }
        }
        
        // Send any remaining data to background script
        if (extractedJobs.length > 0) {
          console.log(`Sending remaining ${extractedJobs.length} jobs to background`);
          sendJobDataToBackground();
        }
        
        // If there are more pages, navigate to the next page
        if (isExtracting && currentPage < totalPages) {
          const navigated = await navigateToNextPage();
          if (!navigated) {
            console.log("Failed to navigate to next page");
            break;
          }
        } else {
          break;
        }
      } catch (error) {
        console.error(`Error on page ${currentPage}:`, error);
        break;
      }
    }
    
    // Finish extraction
    console.log(`Extraction complete. Extracted ${extractedJobs.length} jobs.`);
    isExtracting = false;
  }
///////////////////////////////////////
// Function to get job detail URL from a job item
function getJobDetailUrl(jobItem) {
  // If the job item is an anchor, use its href
  if (jobItem.tagName === "A" && jobItem.hasAttribute("href")) {
    const href = jobItem.getAttribute("href");
    return href.startsWith("http") ? href : new URL(href, window.location.origin).href;
  }
  
  // Look for anchors within the job item
  const anchor = jobItem.querySelector("a[href]");
  if (anchor && anchor.hasAttribute("href")) {
    const href = anchor.getAttribute("href");
    return href.startsWith("http") ? href : new URL(href, window.location.origin).href;
  }
  
  // Check for data attributes that might contain URLs
  const dataAttributes = ["data-job-url", "data-url", "data-href"];
  for (const attr of dataAttributes) {
    if (jobItem.hasAttribute(attr)) {
      const href = jobItem.getAttribute(attr);
      return href.startsWith("http") ? href : new URL(href, window.location.origin).href;
    }
  }
  
  return null;
}

// Function to determine if we should visit the detail page
function shouldVisitDetailPage() {
    // Check current site
    const currentSite = detectJobSite();
    
    // Skip for sites known to block iframes
    if (currentSite === "welcometothejungle") {
      return false;
    }
    
    // Visit detail pages if we're missing key information
    const missingInfo = !document.querySelector(".job-description") && 
                       !document.querySelector("[data-job-description]");
    
    return missingInfo;
  }
//////////////////////////////////
async function visitAndExtractJobDetail(url) {
    // Check if we're on WTTJ or other sites known to block iframes
    const currentSite = detectJobSite();
    if (currentSite === "welcometothejungle") {
      console.log("Skipping iframe for WTTJ - using alternative method");
      return extractWTTJDetailData(url);
    }
    
    return new Promise((resolve) => {
      try {
        // Create a hidden iframe to load the detail page
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        // Set a timeout in case the page doesn't load
        const timeout = setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch (e) {}
          resolve({});
        }, 10000);
        
        // Listen for iframe load
        iframe.onload = () => {
          clearTimeout(timeout);
          
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            
            // Extract data from the iframe
            const detailData = {
              jobDescription: extractTextBySelectors(iframeDoc, [
                ".job-description", 
                "#job-description", 
                "[data-job-description]",
                ".jobsearch-JobComponent-description"
              ]),
              requiredSkills: extractTextBySelectors(iframeDoc, [
                ".skills", 
                "#skills", 
                "[data-skills]"
              ]),
              experienceRequirements: extractTextBySelectors(iframeDoc, [
                ".experience", 
                "#experience", 
                "[data-experience]"
              ]),
              educationRequirements: extractTextBySelectors(iframeDoc, [
                ".education", 
                "#education", 
                "[data-education]"
              ]),
              benefits: extractTextBySelectors(iframeDoc, [
                ".benefits", 
                "#benefits", 
                "[data-benefits]"
              ]),
              applicationDeadline: extractDate(iframeDoc, [
                ".deadline", 
                "#deadline", 
                "[data-deadline]"
              ])
            };
            
            // Remove the iframe
            document.body.removeChild(iframe);
            
            resolve(detailData);
          } catch (error) {
            console.error("Error extracting from iframe:", error);
            try {
              document.body.removeChild(iframe);
            } catch (e) {}
            resolve({});
          }
        };
        
        // Handle iframe errors
        iframe.onerror = () => {
          clearTimeout(timeout);
          console.error("Iframe failed to load");
          try {
            document.body.removeChild(iframe);
          } catch (e) {}
          resolve({});
        };
        
        // Set the iframe source
        iframe.src = url;
      } catch (error) {
        console.error("Error setting up iframe:", error);
        resolve({});
      }
    });
  }
  
// Special handler for WTTJ job details without using iframes
async function extractWTTJDetailData(url) {
    // For WTTJ, we'll consider the data from the listings page as sufficient
    // We store the URL so the user can visit it later
    return {
      jobDescription: "Visit the job URL for complete description", 
      requiredSkills: "",
      experienceRequirements: "",
      educationRequirements: "",
      benefits: "",
      applicationDeadline: ""
    };
  }
// Improved function to navigate to the next page, with special handling for WTTJ
async function navigateToNextPage() {
    // Increment current page
    currentPage++;
    
    // Detect which job site we're on
    const currentSite = detectJobSite();
    console.log(`Navigating to page ${currentPage} on ${currentSite}`);
    
    // Welcome to the Jungle specific navigation
    if (currentSite === "welcometothejungle") {
      // Try to find the "Next" button (right arrow)
      const rightArrow = document.querySelector("nav[aria-label='Pagination'] a svg[alt='Right']");
      
      if (rightArrow) {
        // Find the parent <a> element
        const nextButton = rightArrow.closest('a');
        if (nextButton) {
          console.log("Found WTTJ next button (right arrow)");
          
          // Click the next button
          nextButton.click();
          await waitForPageLoad();
          updateProgress();
          return true;
        }
      }
      
      // If we can't find the right arrow, look for the specific page number
      const pageLinks = document.querySelectorAll("nav[aria-label='Pagination'] ul li a");
      for (const link of pageLinks) {
        if (link.textContent && link.textContent.trim() === currentPage.toString()) {
          console.log(`Found WTTJ page ${currentPage} link`);
          link.click();
          await waitForPageLoad();
          updateProgress();
          return true;
        }
      }
      
      // If we can't find the exact page, try to get the URL and modify it
      try {
        // Look at the current URL pattern
        const currentUrl = window.location.href;
        
        // Check if URL has a page parameter
        if (currentUrl.includes("page=")) {
          const newUrl = currentUrl.replace(/page=\d+/, `page=${currentPage}`);
          console.log(`Navigating to WTTJ URL: ${newUrl}`);
          window.location.href = newUrl;
          await waitForPageLoad();
          updateProgress();
          return true;
        }
        
        // If no page parameter, add it
        const urlObj = new URL(window.location.href);
        urlObj.searchParams.set("page", currentPage);
        console.log(`Navigating to WTTJ URL with added page param: ${urlObj.toString()}`);
        window.location.href = urlObj.toString();
        await waitForPageLoad();
        updateProgress();
        return true;
      } catch (error) {
        console.error("Error modifying WTTJ URL:", error);
      }
    }
    
    // [Rest of the existing code for other sites...]
    
    // Site-specific navigation
    if (currentSite === "indeed") {
      // Indeed-specific next page button
      const indeedNextButton = document.querySelector("[data-testid='pagination-page-next'], [aria-label='Next Page'], nav[role='navigation'] a:last-child");
      if (indeedNextButton) {
        indeedNextButton.click();
        await waitForPageLoad();
        updateProgress();
        return true;
      }
    } else if (currentSite === "apec") {
      // Apec-specific next page button
      const apecNextButton = document.querySelector(".pagination a[rel='next'], .pagination-nav .next, .pagination-nav [aria-label='Page suivante']");
      if (apecNextButton) {
        apecNextButton.click();
        await waitForPageLoad();
        updateProgress();
        return true;
      }
      
      // Apec sometimes has page parameters in URL
      const url = new URL(window.location.href);
      if (url.searchParams.has("page")) {
        url.searchParams.set("page", currentPage.toString());
        window.location.href = url.toString();
        await waitForPageLoad();
        updateProgress();
        return true;
      }
    } else if (currentSite === "hellowork") {
      // Hellowork-specific next page button
      const helloworkNextButton = document.querySelector("[data-cy='pagination-next'], [aria-label='Suivant'], a[rel='next']");
      if (helloworkNextButton) {
        helloworkNextButton.click();
        await waitForPageLoad();
        updateProgress();
        return true;
      }
    }
    
    // Find next page link/button with generic selectors
    const nextPageSelectors = [
      ".pagination__next",
      ".next-page",
      "[data-next-page]",
      "a.next",
      ".pagination-next",
      "li.next a",
      "a[rel='next']",
      "button.next",
      "[aria-label='Next']",
      "[aria-label='Next Page']",
      "[aria-label='Suivant']",
      "[aria-label='Page suivante']",
      ".ais-Pagination-item--next a",
      "[data-testid='pagination-page-next']",
      "a.pagination-next",
      ".navNext",
      "a.right",
      "a.nextLink",
      ".pager-next a",
      "nav a:last-child"
    ];
    
    for (const selector of nextPageSelectors) {
      const nextButton = document.querySelector(selector);
      if (nextButton) {
        // Click the next button
        console.log("Found next button with selector:", selector);
        nextButton.click();
        
        // Wait for page to load
        await waitForPageLoad();
        
        // Update the progress
        updateProgress();
        
        return true;
      }
    }
    
    // [Rest of the existing code for generic page navigation...]
    
    // If no navigation method worked
    console.log("No navigation method found for next page");
    return false;
  }

// Function to extract data from a job detail page
function extractJobDetail() {
  const jobData = {
    jobTitle: "",
    companyName: "",
    location: "",
    employmentType: "",
    salaryRange: "",
    jobDescription: "",
    requiredSkills: "",
    experienceRequirements: "",
    educationRequirements: "",
    benefits: "",
    applicationDeadline: "",
    postedDate: "",
    jobUrl: window.location.href,
    sourceWebsite: window.location.hostname,
    lastUpdated: new Date().toISOString()
  };
  
  try {
    // Extract job title
    jobData.jobTitle = extractTextBySelectors(document, [
      "h1",
      ".job-title", 
      "#job-title", 
      "[data-job-title]",
      ".jobsearch-JobInfoHeader-title"
    ]);
    
    // Extract company name
    jobData.companyName = extractTextBySelectors(document, [
      ".company-name", 
      "#company-name", 
      "[data-company]",
      ".jobsearch-InlineCompanyRating"
    ]);
    
    // Extract location
    jobData.location = extractTextBySelectors(document, [
      ".location", 
      "#location", 
      "[data-location]",
      ".jobsearch-JobInfoHeader-subtitle .jobsearch-JobInfoHeader-subtitle-location"
    ]);
    
    // Extract employment type
    jobData.employmentType = extractTextBySelectors(document, [
      ".employment-type", 
      "#job-type", 
      "[data-job-type]",
      ".metadata-employment-type"
    ]);
    
    // Extract salary range
    jobData.salaryRange = extractTextBySelectors(document, [
      ".salary", 
      "#salary", 
      "[data-salary]",
      ".metadata-salary-snippet"
    ]);
    
    // Extract job description
    jobData.jobDescription = extractTextBySelectors(document, [
      ".job-description", 
      "#job-description", 
      "[data-job-description]",
      ".jobsearch-JobComponent-description"
    ]);
    
    // Extract required skills
    jobData.requiredSkills = extractTextBySelectors(document, [
      ".skills", 
      "#skills", 
      "[data-skills]"
    ]);
    
    // Extract experience requirements
    jobData.experienceRequirements = extractTextBySelectors(document, [
      ".experience", 
      "#experience", 
      "[data-experience]"
    ]);
    
    // Extract education requirements
    jobData.educationRequirements = extractTextBySelectors(document, [
      ".education", 
      "#education", 
      "[data-education]"
    ]);
    
    // Extract benefits
    jobData.benefits = extractTextBySelectors(document, [
      ".benefits", 
      "#benefits", 
      "[data-benefits]"
    ]);
    
    // Extract application deadline
    jobData.applicationDeadline = extractDate(document, [
      ".deadline", 
      "#deadline", 
      "[data-deadline]"
    ]);
    
    // Extract posted date
    jobData.postedDate = extractDate(document, [
      ".date", 
      "#posted-date", 
      "[data-posted-date]",
      ".jobsearch-JobMetadataFooter"
    ]);
  } catch (error) {
    console.error("Error extracting job detail:", error);
  }
  
  return jobData;
}

// Function to update the progress in the background script
function updateProgress() {
  chrome.runtime.sendMessage({
    action: "updateProgress",
    currentPage: currentPage,
    totalPages: totalPages
  });
}

// Improved function to send collected job data to background script
function sendJobDataToBackground() {
    if (extractedJobs.length === 0) {
      console.log("No jobs to send to background");
      return;
    }
    
    console.log(`Sending ${extractedJobs.length} jobs to background script`);
    
    chrome.runtime.sendMessage({
      action: "addJobData",
      data: extractedJobs
    }, response => {
      if (chrome.runtime.lastError) {
        console.error("Error sending data to background:", chrome.runtime.lastError);
      } else if (response) {
        console.log(`Background script confirmed adding ${response.count} jobs`);
      }
    });
    
    // Clear the local array after sending
    extractedJobs = [];
  }

// Helper function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Improved function to wait for page load, with special handling for WTTJ
async function waitForPageLoad() {
    return new Promise(resolve => {
      const currentSite = detectJobSite();
      
      // Custom handling for WTTJ since it uses client-side rendering
      if (currentSite === "welcometothejungle") {
        let retries = 0;
        const maxRetries = extractionConfig.maxRetries * 2; // Double the retries for WTTJ
        const checkInterval = extractionConfig.delay / 2;
        
        const checkLoaded = () => {
          // Look for content that indicates the page has loaded
          const jobCards = document.querySelectorAll("li[data-testid='search-results-list-item-wrapper'], div.sc-guWVcn, [data-object-id]");
          
          if (jobCards.length > 5) {
            console.log(`WTTJ page loaded with ${jobCards.length} job cards`);
            // Add an extra delay to ensure everything is rendered
            setTimeout(() => resolve(true), 1000);
          } else if (retries >= maxRetries) {
            console.log("WTTJ page load timed out");
            resolve(false);
          } else {
            retries++;
            setTimeout(checkLoaded, checkInterval);
          }
        };
        
        checkLoaded();
        return;
      }
      
      // Standard page load checking for other sites
      let retries = 0;
      const maxRetries = extractionConfig.maxRetries;
      const checkInterval = extractionConfig.delay / 2;
      
      const checkReadyState = () => {
        if (document.readyState === "complete") {
          // Add a small delay after page is "complete" to ensure JavaScript has run
          setTimeout(() => {
            console.log("Page loaded successfully");
            resolve(true);
          }, 500);
        } else if (retries >= maxRetries) {
          console.log("Page load timed out");
          resolve(false);
        } else {
          retries++;
          setTimeout(checkReadyState, checkInterval);
        }
      };
      
      checkReadyState();
    });
  }