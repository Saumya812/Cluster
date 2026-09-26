"""Seed / Apify crawl for educational city topics (80–100 per city)."""

from __future__ import annotations

import json
import os
import random
import re
from typing import Any

import httpx
from dotenv import load_dotenv

from db import init_db
from edu_topics import CITIES, CITY_META, clear_city_topics, topic_count, upsert_topic

load_dotenv()

APIFY_API_KEY = os.getenv("APIFY_API_KEY", "").strip()
TARGET_MIN = 80
TARGET_MAX = 100

# Broad seed banks used when Apify is unavailable or returns thin results.
SEED: dict[str, list[str]] = {
    "ml": [
        "Supervised Learning", "Unsupervised Learning", "Reinforcement Learning",
        "Linear Regression", "Logistic Regression", "Decision Trees", "Random Forests",
        "Gradient Boosting", "XGBoost", "Support Vector Machines", "k-Nearest Neighbors",
        "Naive Bayes", "K-Means Clustering", "Hierarchical Clustering", "DBSCAN",
        "Principal Component Analysis", "t-SNE", "UMAP", "Feature Engineering",
        "Feature Selection", "Cross Validation", "Hyperparameter Tuning", "Bias Variance Tradeoff",
        "Overfitting", "Regularization", "Lasso Ridge ElasticNet", "Ensemble Methods",
        "Bagging", "Boosting", "Stacking", "Imbalanced Learning", "Anomaly Detection",
        "Time Series Forecasting", "ARIMA", "Prophet Forecasting", "Recommendation Systems",
        "Collaborative Filtering", "Content Based Filtering", "Matrix Factorization",
        "Neural Networks Basics", "Backpropagation", "Activation Functions", "Dropout",
        "Batch Normalization", "Optimizers SGD Adam", "Loss Functions", "CNN Fundamentals",
        "RNN LSTM GRU", "Transformers for ML", "Transfer Learning", "Fine Tuning Models",
        "Model Evaluation Metrics", "ROC AUC", "Confusion Matrix", "Precision Recall F1",
        "Calibration", "Online Learning", "Active Learning", "Semi Supervised Learning",
        "Self Supervised Learning", "Metric Learning", "Gaussian Processes", "Bayesian Inference",
        "EM Algorithm", "Hidden Markov Models", "Graphical Models", "Causal Inference Basics",
        "Uplift Modeling", "Survival Analysis", "Multi Label Classification", "Ordinal Regression",
        "Multi Arm Bandits", "Contextual Bandits", "Q Learning", "Policy Gradients",
        "Actor Critic Methods", "Deep Q Networks", "ML Pipelines", "MLOps Basics",
        "Model Serving", "Feature Stores", "Data Drift", "Concept Drift", "Explainable AI SHAP",
        "LIME Explanations", "Fairness in ML", "Privacy Preserving ML", "Federated Learning",
        "AutoML", "Neural Architecture Search", "Embedding Methods", "Word Embeddings for ML",
        "Dimensionality Reduction", "Manifold Learning", "Kernel Methods", "Perceptron",
        "Softmax Regression", "Isotonic Regression", "Quantile Regression", "Robust Regression",
        "Outlier Detection Methods", "Density Estimation", "Mixture Models",
    ],
    "ai": [
        "Artificial General Intelligence", "Narrow AI", "Intelligent Agents", "Multi Agent Systems",
        "Planning Algorithms", "Search Algorithms AI", "A Star Search", "Minimax",
        "Alpha Beta Pruning", "Knowledge Representation", "Ontologies", "Expert Systems",
        "Rule Based Systems", "Fuzzy Logic", "Natural Language Processing", "Tokenization",
        "Part of Speech Tagging", "Named Entity Recognition", "Dependency Parsing",
        "Semantic Role Labeling", "Word Sense Disambiguation", "Topic Modeling LDA",
        "Text Classification", "Sentiment Analysis", "Machine Translation", "Question Answering",
        "Summarization", "Dialogue Systems", "Chatbots", "Large Language Models",
        "Prompt Engineering", "Retrieval Augmented Generation", "Vector Databases",
        "Embeddings for NLP", "Attention Mechanisms", "Transformer Architecture",
        "BERT", "GPT Style Models", "Fine Tuning LLMs", "RLHF", "Computer Vision Basics",
        "Image Classification", "Object Detection", "YOLO", "Semantic Segmentation",
        "Instance Segmentation", "Pose Estimation", "Face Recognition", "OCR",
        "Generative Adversarial Networks", "Diffusion Models", "Stable Diffusion",
        "Image Captioning", "Vision Transformers", "Multimodal Models", "Speech Recognition",
        "Text to Speech", "Voice Assistants", "Robotics Perception", "SLAM",
        "Motion Planning", "Reinforcement Learning for Robotics", "Cognitive Architectures",
        "Symbolic AI", "Neuro Symbolic AI", "Commonsense Reasoning", "Knowledge Graphs",
        "Graph Neural Networks", "Bayesian Networks", "Markov Decision Processes",
        "Constraint Satisfaction", "Logical Inference", "Theorem Proving Basics",
        "AI Ethics", "AI Safety", "Alignment Problem", "Interpretability",
        "Adversarial Examples", "Robustness in AI", "AI Evaluation Benchmarks",
        "Agent Memory", "Tool Use Agents", "Planning with LLMs", "World Models",
        "Simulation Environments", "Synthetic Data for AI", "Data Labeling Pipelines",
        "Active Learning for AI", "Few Shot Learning", "Zero Shot Learning",
        "Meta Learning", "Continual Learning", "Transfer Learning in AI",
        "AI Product Design", "Human AI Interaction", "Recommendation with AI",
        "Search Ranking", "Personalization Systems", "AI Observability",
    ],
    "programming": [
        "Variables and Types", "Control Flow", "Functions", "Recursion", "Scope Closures",
        "Object Oriented Programming", "Classes and Inheritance", "Interfaces Abstractions Types",
        "Functional Programming", "Immutability", "Higher Order Functions", "Map Filter Reduce",
        "Error Handling", "Exceptions", "Logging", "Debugging Techniques", "Unit Testing",
        "Integration Testing", "Test Driven Development", "Property Based Testing",
        "Data Structures Arrays", "Linked Lists", "Stacks Queues", "Hash Tables",
        "Trees Binary Search Trees", "Heaps", "Graphs", "Tries", "Sets Maps",
        "Sorting Algorithms", "Searching Algorithms", "Big O Complexity", "Dynamic Programming",
        "Greedy Algorithms", "Divide and Conquer", "Backtracking", "Bit Manipulation",
        "String Algorithms", "Regular Expressions", "Memory Management", "Pointers References",
        "Garbage Collection", "Concurrency Threads", "Async Await", "Parallel Programming",
        "Locks Mutexes", "Channels Message Passing", "Networking Sockets", "HTTP Clients",
        "File IO", "Serialization JSON", "Binary Protocols", "Command Line Tools",
        "Package Managers", "Build Systems", "Makefiles", "CI CD Pipelines",
        "Version Control Git", "Code Review Practices", "Design Patterns", "SOLID Principles",
        "Clean Architecture", "Domain Driven Design", "Refactoring", "Code Smells",
        "Python Programming", "JavaScript Programming", "TypeScript", "Java Programming",
        "C Programming", "C++ Programming", "Rust Programming", "Go Programming",
        "SQL Basics", "NoSQL Basics", "ORMs", "Database Transactions", "Caching Strategies",
        "Redis Basics", "Message Queues", "Event Driven Architecture", "Microservices Basics",
        "Monoliths vs Services", "API Design", "REST", "GraphQL", "gRPC",
        "Security OWASP Basics", "Authentication Patterns", "Encryption Basics",
        "Performance Profiling", "Benchmarking", "Observability Metrics", "Tracing",
        "Containers Docker", "Kubernetes Basics", "Infrastructure as Code", "Linux Shell",
        "Compilers Interpreters", "Virtual Machines", "Bytecode", "Static Analysis",
    ],
    "web": [
        "HTML Semantics", "Accessible HTML", "Forms and Validation", "CSS Selectors",
        "CSS Box Model", "Flexbox", "CSS Grid", "Responsive Design", "Mobile First CSS",
        "CSS Variables", "Animations Transitions", "Tailwind CSS", "Sass SCSS",
        "JavaScript DOM", "Events Bubbling", "Fetch API", "Promises", "Async UI Patterns",
        "ES Modules", "Local Storage", "IndexedDB", "Service Workers", "PWA Basics",
        "React Fundamentals", "React Hooks", "React Router", "State Management",
        "Redux Basics", "Vue Basics", "Svelte Basics", "Next.js", "SSR SSG ISR",
        "TypeScript for Web", "Web Components", "Shadow DOM", "Canvas API", "WebGL Basics",
        "SVG Graphics", "Responsive Images", "Font Loading", "SEO for Developers",
        "Core Web Vitals", "Performance Budgets", "Lazy Loading", "Code Splitting",
        "Bundlers Vite Webpack", "Node.js Basics", "Express.js", "FastAPI for Web",
        "REST API Design", "GraphQL APIs", "WebSockets", "Server Sent Events",
        "Authentication JWT", "OAuth OpenID", "Cookies Sessions", "CORS",
        "CSRF Protection", "XSS Prevention", "Content Security Policy", "HTTPS TLS",
        "HTTP Caching", "CDN Basics", "Reverse Proxies", "Load Balancing Web",
        "Databases for Web", "Prisma ORM", "Migrations", "File Uploads",
        "Image Processing Web", "Email Sending", "Background Jobs", "Rate Limiting",
        "API Gateways", "Microfrontends", "Monorepos", "Design Systems",
        "Component Libraries", "Storybook", "End to End Testing Playwright",
        "Cypress Testing", "Accessibility a11y", "Internationalization i18n",
        "Localization", "Dark Mode Theming", "Animation Libraries", "Three.js Web",
        "Web Audio API", "WebRTC Basics", "Browser Extensions", "Electron Basics",
        "Deploying Static Sites", "Vercel Netlify", "Dockerizing Web Apps",
        "Monitoring Frontends", "Error Tracking", "Analytics Events", "A B Testing Web",
        "Payment Integrations", "Stripe Checkout", "CMS Headless", "Markdown Content Sites",
    ],
}

SUBTOPIC_TEMPLATES = [
    "Introduction to {topic}",
    "Core concepts in {topic}",
    "Practical {topic} examples",
    "{topic} best practices",
    "Common pitfalls in {topic}",
    "Advanced {topic}",
    "{topic} tools and libraries",
    "Evaluating {topic}",
]


def _slug_clean(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


def _subtopics_for(topic: str) -> list[str]:
    rng = random.Random(topic)
    k = rng.randint(3, 6)
    picks = rng.sample(SUBTOPIC_TEMPLATES, k=min(k, len(SUBTOPIC_TEMPLATES)))
    return [p.format(topic=topic) for p in picks]


def _assign_street(city: str, index: int) -> str:
    streets = CITY_META[city]["streets"]
    return streets[index % len(streets)]


async def crawl_with_apify(city: str) -> list[str]:
    """Use Apify Google Search scraper when APIFY_API_KEY is present."""
    if not APIFY_API_KEY:
        return []

    label = CITY_META[city]["label"]
    queries = [
        f"{label} topics list syllabus",
        f"{label} concepts curriculum roadmap",
        f"important {label} subjects for beginners",
    ]
    actor = "apify~google-search-scraper"
    url = f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items"
    params = {"token": APIFY_API_KEY}
    payload = {
        "queries": "\n".join(queries),
        "resultsPerPage": 20,
        "maxPagesPerQuery": 1,
        "languageCode": "en",
    }

    titles: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, params=params, json=payload)
            if resp.status_code >= 400:
                print(f"[crawl] Apify HTTP {resp.status_code}: {resp.text[:200]}")
                return []
            items = resp.json()
            if not isinstance(items, list):
                return []
            for item in items:
                for key in ("title", "organicResults"):
                    if key == "title" and item.get("title"):
                        titles.append(str(item["title"]))
                    if key == "organicResults":
                        for org in item.get("organicResults") or []:
                            if org.get("title"):
                                titles.append(str(org["title"]))
                            desc = org.get("description") or org.get("snippet") or ""
                            for piece in re.split(r"[,:;•|/]", desc):
                                piece = _slug_clean(piece)
                                if 3 <= len(piece.split()) <= 6:
                                    titles.append(piece)
    except Exception as exc:
        print(f"[crawl] Apify failed: {exc}")
        return []

    cleaned = []
    seen = set()
    for t in titles:
        t = _slug_clean(re.sub(r"\|.*$", "", t))
        t = re.sub(r"^(top|best|complete|ultimate)\s+\d+\s+", "", t, flags=re.I)
        if len(t) < 4 or len(t) > 60:
            continue
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(t)
    return cleaned


def _merge_topics(city: str, crawled: list[str]) -> list[str]:
    seed = SEED[city][:]
    random.Random(city).shuffle(seed)
    merged: list[str] = []
    seen = set()
    for name in crawled + seed:
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(name)
        if len(merged) >= TARGET_MAX:
            break
    if len(merged) < TARGET_MIN:
        # pad from seed repeats with suffixes
        i = 0
        while len(merged) < TARGET_MIN and i < len(seed) * 2:
            base = seed[i % len(seed)]
            name = base if i < len(seed) else f"{base} Workshop"
            key = name.lower()
            if key not in seen:
                seen.add(key)
                merged.append(name)
            i += 1
    return merged[:TARGET_MAX]


async def populate_city(city: str, replace: bool = True) -> int:
    init_db()
    crawled = await crawl_with_apify(city)
    print(f"[crawl] {city}: apify returned {len(crawled)} candidates")
    topics = _merge_topics(city, crawled)
    if replace:
        clear_city_topics(city)
    for i, name in enumerate(topics):
        upsert_topic(city, name, _subtopics_for(name), _assign_street(city, i))
    return topic_count(city)


async def populate_all(replace: bool = True) -> dict[str, int]:
    counts = {}
    for city in CITIES:
        counts[city] = await populate_city(city, replace=replace)
        print(f"[crawl] {city}: stored {counts[city]} topics")
    return counts


if __name__ == "__main__":
    import asyncio

    print(json.dumps(asyncio.run(populate_all()), indent=2))
