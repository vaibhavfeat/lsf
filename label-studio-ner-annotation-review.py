from label_studio_sdk import Client
from collections import Counter

# === Configuration ===
LABEL_STUDIO_URL = "http://localhost:8080"   # change if hosted elsewhere
API_KEY = "5eaa022154752a5822f2eb552011143958a753a0"                # replace with your API key
PROJECT_ID = 2                               # replace with your actual project ID

# === Connect to Label Studio ===
ls = Client(url=LABEL_STUDIO_URL, api_key=API_KEY)
ls.check_connection()

# === Get project ===
project = ls.get_project(PROJECT_ID)

# === Fetch all tasks with annotations ===
tasks = project.get_tasks()

# === Count labels from all annotations ===
label_counter = Counter()

for task in tasks:
    annotations = task.get("annotations", [])
    for annotation in annotations:
        results = annotation.get("result", [])
        for result in results:
            labels = result.get("value", {}).get("labels", [])
            for label in labels:
                label_counter[label] += 1

# === Display results ===
print("Entity Label Distribution:")
for label, count in label_counter.items():
    print(f"{label}: {count}")
