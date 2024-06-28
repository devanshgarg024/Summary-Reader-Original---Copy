from transformers import pipeline
import sys
import json

def summarize(text):
    pipe = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")
    
    # Split the text into chunks of up to 1000 words
    words = text.split()
    chunks = []
    chunk_size = 500
    for i in range(0, len(words), chunk_size):
        chunk = ' '.join(words[i:i + chunk_size])
        chunks.append(chunk)
    
    # Summarize each chunk
    summaries = []
    for chunk in chunks:
        summary = pipe(chunk, max_length=130, min_length=30, do_sample=True)
        summaries.append(summary[0]['summary_text'])
    
    # Combine the summaries
    combined_summary = ' '.join(summaries)
    
    return combined_summary

if __name__ == "__main__":
    input_data = sys.stdin.read()
    summary = summarize(input_data)
    result = {"summary_text": summary}
    print(json.dumps(result))  # Output the result as a JSON string
