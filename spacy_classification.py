import spacy
import pandas as pd

# Load the spaCy English model (make sure it's downloaded)
nlp = spacy.load("en_core_web_sm")

# Define category-wise keyword lists
raw_categories = {
    "upi_transaction_failed": ["gpay", "upi", "transaction failed", "amount debited"],
    "atm_issues": ["atm", "authorization failed", "withdraw", "atm error"],
    "credit_card_authentication_issue": ["otp", "credit card", "authentication", "declined"],
    "personal": ["birthday", "party", "weekend", "family"]
}

sample_emails = [
{
    "category": "upi_transaction_failed",
    "subject": "UPI Transaction Failed - Urgent",
    "body": "I tried sending ₹2000 via GPay to my friend but the transaction failed. The amount has been debited from my account, but the receiver hasn't received the money yet."
},
{
    "category": "atm_issues",
    "subject": "Unable to Withdraw Cash from ATM",
    "body": "I visited the ATM today but was unable to withdraw money. The screen showed 'authorization failed'. Please look into this as my card is working elsewhere."
},
{
    "category": "credit_card_transaction_issue",
    "subject": "Request for New Credit Card Issuance",
    "body": "I have applied for a new credit card two weeks ago but have not received any update on dispatch. Kindly confirm the current status of my application."
},
{
    "category": "credit_card_authentication_issue",
    "subject": "Credit Card Transaction Authentication Failed",
    "body": "While making a payment on an e-commerce website, my credit card transaction was declined due to authentication failure. The OTP didn’t work properly."
},
{
    "category": "sms_gateway_issue",
    "subject": "Not Receiving SMS for OTP",
    "body": "I am not receiving OTP messages on my mobile number while trying to log into my banking account. Please check if SMS service is working."
},
{
    "category": "internet_banking_issue",
    "subject": "Unable to Access Internet Banking",
    "body": "I am facing issues logging into my Internet Banking portal. It says that my user ID is locked. Please help me unlock the access."
},
{
    "category": "personal",
    "subject": "Family Get-Together This Weekend",
    "body": "Hey! We’re planning a birthday party for our daughter this Saturday at our place. Hope you and your family can join us."
},
{
    "category": "promotions",
    "subject": "Limited Time Offer – Flat 20% Discount",
    "body": "Shop now and get 20% off on all electronics. This deal is only valid till Sunday. Don’t miss out!"
},
{
    "category": "spam",
    "subject": "You Have Won a Million Dollars!",
    "body": "Congratulations! You have been selected as the lucky winner of our grand lottery. Click here to claim your prize money now."
}

]

# Preprocess keywords: lemmatize them
def lemmatize_keywords(keywords):
    lemmas = []
    for kw in keywords:
        doc = nlp(kw.lower())
        lemmas.append(" ".join([token.lemma_ for token in doc]))
    return lemmas

# Lemmatize keyword lists
lemmatized_keywords = {
    category: lemmatize_keywords(keywords)
    for category, keywords in raw_categories.items()
}

# Analyze each email
results = []

def classify_emails(email):
    doc = nlp(email.lower())
    email_lemmas = [token.lemma_ for token in doc if not token.is_punct and not token.is_space]

    email_lemmas_text = " ".join(email_lemmas)  # for phrase matching
    category_scores = {}

    for category, keywords in lemmatized_keywords.items():
        match_count = sum(1 for kw in keywords if kw in email_lemmas_text)
        category_scores[category] = match_count

    best_category = max(category_scores, key=category_scores.get)
    best_score = category_scores[best_category]
    matched_keywords = [kw for kw in lemmatized_keywords[best_category] if kw in email_lemmas_text]

    return email, best_category if best_score > 0 else "unknown",best_score, matched_keywords


for email_data in sample_emails:
    # print(email_data)
    email, best_category, best_score, matched_keywords = classify_emails(email_data['body'])
    results.append({
      "email": email,
      "category": best_category,
      "score": best_score,
      "matched_keywords": matched_keywords
  })


# Create DataFrame
df = pd.DataFrame(results)
# pd.set_option("display.max_colwidth", None)
df[['email', 'category', 'score', 'matched_keywords']]
df
