# 🎯 FIRST PAYING CUSTOMER - 14 DAY EXECUTION PLAN

**Mission:** Land ONE real customer payment within 14 days
**Start Date:** February 11, 2026
**Target Date:** February 25, 2026
**Status:** READY TO EXECUTE

---

## 📦 PHASE 1: CUSTOMER DEMO PACK (Days 1-2)

### 1.1 Landing Message
**File:** `docs/CUSTOMER_DEMO_PACK.md`

Content:
```markdown
# ☀️ Solar System Quote & Installation - Quick Demo

## What You'll See
1. **5-minute online quote** - Enter your location, roof details, usage
2. **PDF proposal** - Professional quote with equipment breakdown & pricing
3. **Real-world example** - See sample customer installation

## Next Steps
- Request a demo via Zalo: [link]
- Discuss with our team
- Move to contract & installation

## Why Choose Us?
- Expert solar system design (15+ years experience)
- Transparent pricing
- Fast installation (2-4 weeks)
- 25-year warranty on panels
```

**Action:** Create this file
**Effort:** 15 minutes

---

### 1.2 Demo PDF Sample
**File:** `docs/SAMPLE_QUOTE.pdf`

**Action:**
1. Generate a real quote via the system for a sample project
2. Download PDF from `GET /api/public/quotes/:id/pdf`
3. Save as `docs/SAMPLE_QUOTE.pdf`

**Sample Quote Data:**
```
Project: Demo Household (Hanoi)
- Monthly usage: 400 kWh
- Roof area: 30 m²
- System size: 10 kWp
- Equipment: 25x JinkoSolar 400W + 1x Growatt 10kW inverter
- Subtotal: 150,000,000 VND
- Tax (10%): 15,000,000 VND
- Discount: -5,000,000 VND
- TOTAL: 160,000,000 VND
```

**Effort:** 30 minutes (generate + download)

---

### 1.3 3-Step Usage Guide
**File:** `docs/HOW_TO_USE_DEMO.md`

```markdown
# How to Use the Solar Demo

## Step 1: Request Demo (via Zalo)
Send this message to our Zalo:
"Hi, I'd like a solar quote. My monthly electricity bill is around 2 million VND."

**Response time:** < 2 hours

## Step 2: Fill Out Survey (5 minutes)
1. Visit [your-domain]/demo
2. Enter your location & roof details
3. Click "Generate Quote"

## Step 3: Review Quote & Next Steps
- Download PDF quote
- Schedule inspection with our team
- Sign contract & begin installation

## Key Info
- Quotes are free & non-binding
- We only install quality systems (SMA, Growatt, Jinko)
- Fast 2-4 week installation
- 25-year panel warranty
```

**Action:** Create this file
**Effort:** 20 minutes

---

### 1.4 Zalo/Email Send Template
**File:** `docs/OUTREACH_TEMPLATES.md`

#### Zalo Template (Vietnamese)
```
Xin chào 👋

Tôi là [Your Name] từ Solar Solutions. Chúng tôi chuyên thiết kế & lắp đặt hệ thống điện mặt trời cho gia đình.

🌞 Bạn muốn:
- Giảm hóa đơn điện 50-80%?
- Sử dụng năng lượng sạch?
- Tăng giá trị ngôi nhà?

✅ Chúng tôi sẽ:
1. Tính toán quoute miễn phí trong 1 giờ
2. Thiết kế hệ thống phù hợp
3. Lắp đặt nhanh (2-4 tuần)
4. Bảo hành 25 năm

📱 Demo online: [link]
📞 Gọi: 0987-123-456

Bạn quan tâm không? 😊
```

#### Email Template
```
Subject: Free Solar Quote for Your Home - [Location]

Hi [Name],

I noticed your home in [Location] could benefit from solar energy.

Here's what we offer:
- Custom solar design (free evaluation)
- 50-80% electricity cost reduction
- 25-year warranty
- 2-4 week installation

See sample quote: [PDF link]

Would you like a free quote? It takes 5 minutes online.

Click here to get started: [link]

Best regards,
[Your Name]
Solar Solutions
```

**Action:** Create this file
**Effort:** 20 minutes

**Phase 1 Total: 1.5 hours**

---

## 📊 PHASE 2: MINIMAL TRACKING (Days 1-3)

### 2.1 PDF Generation Logging
**File:** `packages/backend/src/services/quote-pdf.ts`

**Add at start of generateQuotePDF():**
```typescript
console.log(`[PDF_GENERATED] quote_id=${quoteId} customer_id=${quote.customer_id} timestamp=${new Date().toISOString()}`);
```

**Purpose:** Track when quotes are generated (proxy for customer engagement)

**Effort:** 5 minutes

---

### 2.2 PDF Download Logging
**File:** `packages/backend/src/app.ts`

Find the public PDF endpoint:
```typescript
// Add around line with GET /api/public/quotes/:id/pdf
app.get('/api/public/quotes/:id/pdf', async (req, res) => {
  console.log(`[PDF_DOWNLOADED] quote_id=${req.params.id} ip=${req.ip} timestamp=${new Date().toISOString()}`);
  // existing logic...
});
```

**Purpose:** Track PDF downloads by non-authenticated users

**Effort:** 5 minutes

---

### 2.3 Simple Counter Endpoint
**File:** `packages/backend/src/app.ts`

**Add new endpoint:**
```typescript
// Track demo engagement
app.get('/api/public/stats/demo', (req, res) => {
  // Count from last 24h console logs
  res.json({
    pdfs_generated_24h: 0, // placeholder
    pdfs_downloaded_24h: 0, // placeholder
    quotes_submitted_24h: 0,
    timestamp: new Date().toISOString()
  });
});
```

**Note:** For MVP, just return hardcoded 0 or read from simple file log
**Effort:** 15 minutes

---

### 2.4 Setup Tracking File
**Action:** Create `logs/demo-tracking.json`
```json
{
  "pdfs_generated": 0,
  "pdfs_downloaded": 0,
  "quotes_submitted": 0,
  "last_updated": "2026-02-11T00:00:00Z"
}
```

**Purpose:** Simple counter file for demo metrics
**Effort:** 5 minutes

**Phase 2 Total: 30 minutes**

---

## 🎯 PHASE 3: EXECUTION PLAN - OUTREACH (Days 4-10)

### 3.1 Target List (10 Real Prospects)

**Source 1: Facebook Solar Groups (2-3 prospects)**
- Search "solar vietnam" groups
- Find recent posts asking about solar
- Message: "Hi [Name], saw your post about solar..."

**Source 2: Google Local Search (2-3 prospects)**
- Search "solar company hanoi" or your city
- Find competitors' reviews
- Call/message recent reviewers: "We have better pricing..."

**Source 3: Direct Network (3-4 prospects)**
- Email: Colleagues, friends, family business owners
- Topic: "Free solar quote for your business"
- Subject: "Reduce your electricity cost 50%"

**Source 4: Zalo Business (1-2 prospects)**
- Post in small business groups
- Message: "Free solar evaluation for your home/business"

---

### 3.2 Day-by-Day Outreach Schedule

**DAY 4 (Feb 14) - Build Target List**
- Identify 10-15 prospects
- Collect phone numbers / emails / Zalo IDs
- Create spreadsheet: `notes/PROSPECT_LIST.csv`

**DAY 5 (Feb 15) - Initial Outreach Wave 1**
- Send Zalo message to prospects 1-5
- Subject: "Free solar quote in 5 minutes"
- Include demo link: https://your-domain/demo
- Expected response: 2-3 replies

**DAY 6 (Feb 16) - Initial Outreach Wave 2**
- Send Zalo message to prospects 6-10
- Follow up on Day 5 non-responders
- Expected response: 2-3 more replies

**DAY 7 (Feb 17) - Engagement**
- Respond to all inquiries quickly (< 1 hour)
- Send SAMPLE_QUOTE.pdf to interested prospects
- Ask: "Does 150M-200M fit your budget?"
- Schedule calls with 2-3 hot leads

**DAY 8 (Feb 18) - Demo Demos**
- Do 2-3 live demos with prospects
- Walk through: location → survey → quote generation
- Answer objections on the spot
- Get verbal commitment if possible

**DAY 9 (Feb 19) - Closing Week Begins**
- Follow up with hot leads by phone
- Send quote via PDF + email
- Ask for commitment: "When can we visit for site survey?"

**DAY 10 (Feb 20) - Convert to Contract**
- For warmest lead, schedule site visit
- Get verbal approval on quote
- Prepare contract for signature

---

### 3.3 Conversion Metrics

Track in `notes/OUTREACH_RESULTS.md`:

```markdown
# Outreach Results

## Target List
| # | Name | Source | Phone | Status | Notes |
|---|------|--------|-------|--------|-------|
| 1 | [Name] | FB Group | +84... | Initial contact | Waiting for response |
| ... | ... | ... | ... | ... | ... |

## Conversion Pipeline
- **Contacts made:** 10
- **Responses:** (track daily)
- **Demo requests:** (track daily)
- **Quotes sent:** (track daily)
- **Meetings scheduled:** (track daily)
- **Contracts signed:** (track daily)
- **Payments received:** (track daily)
```

---

## 💰 PHASE 4: CLOSING (Days 11-14)

### 4.1 Payment Path

**For each qualified lead:**

1. **Verbal Agreement** → "Yes, we want your quote"
2. **Site Visit** → Confirm roof details, access, timeline
3. **Contract Signature** → 60% down payment due
4. **Payment Collection** → Bank transfer or Zalo Pay

**Payment Details:**
- Deposit amount: 60% of quote (e.g., 96M VND on 160M quote)
- Payment method: Bank transfer (preferred) or Zalo Pay
- Timeline: Same day or next business day

### 4.2 Closing Template

**Email/Zalo Message:**
```
Hi [Name],

Based on our discussion, here's your customized solar quote:

💰 System: 10 kWp (25x 400W panels + Growatt 10kW inverter)
💰 Total cost: 160,000,000 VND
💰 Down payment: 96,000,000 VND (60%)
⏰ Installation: [date 2-4 weeks out]

To move forward:
1. Sign contract (PDF attached)
2. Transfer down payment to: [bank account]
3. We handle everything else!

Can you sign today? We can start within 2 weeks.

Best regards,
[Your Name]
```

### 4.3 Payment Confirmation
**In system:** Mark quote as APPROVED → Create Contract → Receive Payment
**Manual tracking:** Update `notes/OUTREACH_RESULTS.md` with payment date

---

## 📋 SIMPLE SUCCESS CRITERIA

| Metric | Target | Actual |
|--------|--------|--------|
| Contacts made | 10 | _ |
| Responses received | 3+ | _ |
| Demos completed | 2+ | _ |
| Quotes sent | 2+ | _ |
| Contracts signed | 1 | _ |
| **Payments received** | **1** | _ |
| Payment amount | 80M+ VND | _ |

---

## 🛠️ TOOLS & SYSTEMS NEEDED

### Already Built (Don't Touch)
✅ Demo landing page
✅ OTP → Lead flow
✅ Project detail + survey
✅ Equipment selection
✅ Quote generation
✅ PDF download
✅ Admin approval
✅ Contract signing

### You Need to Add (Minimal)
- [ ] Landing message doc
- [ ] Sample quote PDF
- [ ] Usage guide
- [ ] Outreach templates
- [ ] PDF logging (1 console.log)
- [ ] Download logging (1 console.log)
- [ ] Counter endpoint (15 lines)
- [ ] Prospect spreadsheet
- [ ] Results tracking doc

---

## 🚀 EXECUTION CHECKLIST

### Phase 1: Demo Pack (Complete by Day 2)
- [ ] Create CUSTOMER_DEMO_PACK.md
- [ ] Generate SAMPLE_QUOTE.pdf
- [ ] Create HOW_TO_USE_DEMO.md
- [ ] Create OUTREACH_TEMPLATES.md

### Phase 2: Tracking (Complete by Day 3)
- [ ] Add PDF generation logging
- [ ] Add PDF download logging
- [ ] Create demo stats endpoint
- [ ] Create demo-tracking.json

### Phase 3: Outreach (Days 4-10)
- [ ] Build prospect list (10+)
- [ ] Send Wave 1 messages (Day 5)
- [ ] Send Wave 2 messages (Day 6)
- [ ] Respond to inquiries (Day 7)
- [ ] Do 2-3 live demos (Day 8)
- [ ] Follow up hot leads (Day 9)
- [ ] Schedule site visits (Day 10)

### Phase 4: Closing (Days 11-14)
- [ ] Conduct site visits
- [ ] Send final quotes + contracts
- [ ] Get signatures
- [ ] **Receive payment**

---

## 📊 DAILY TRACKING

Create `notes/DAILY_LOG.md` and update daily:

```markdown
# Daily Progress Log

## Day 4 (Feb 14)
- Target list: 12 prospects identified
- Next: Send first messages tomorrow

## Day 5 (Feb 15)
- Messages sent: 5
- Responses: 1 (from Nam - hot lead)
- Next: Send more messages, follow up with Nam

[Continue daily...]
```

---

## 🎯 CRITICAL SUCCESS FACTORS

1. **Speed**: Respond to inquiries within 1 hour
2. **Personal Touch**: Use names, reference their situation
3. **Social Proof**: "We've installed 50+ systems in Hanoi"
4. **Clear CTA**: "Can you sign the contract today?"
5. **Payment Method**: Make it easy (bank transfer or Zalo Pay)
6. **Follow-up**: Don't let leads go cold

---

## ⚠️ NO ARCHITECTURE CHANGES

This plan uses ONLY what's already built:
- ✅ Existing landing page
- ✅ Existing OTP system
- ✅ Existing quote generation
- ✅ Existing PDF download
- ✅ Existing contract signing

**Only additions:**
- Documentation files
- 2 console.log statements
- 1 simple endpoint (15 lines)
- Manual tracking spreadsheets

---

## 💡 WHAT SUCCESS LOOKS LIKE

**By Feb 25, 2026:**
- You have contact with 10+ real prospects
- You've generated 2-3 real quotes
- You have 1 signed contract
- You've received first payment (80M+ VND)

**System proves:** Real customers will use this to buy solar.

---

## 📞 SUPPORT

If you get stuck:
- Question about solar features? Check DEMO_LOGIN.md
- Question about the system flow? Check FINAL_VERIFICATION.md
- Question about prospect management? Check OUTREACH_TEMPLATES.md

**Remember:** This is about EXECUTION, not perfection.
Ship, test, iterate.

---

**Status: 🟢 READY TO EXECUTE**

Your system works. Customers are ready. Now go find them. 🚀
