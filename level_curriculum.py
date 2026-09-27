"""Level roadmaps for educational cities (island curriculum)."""

from __future__ import annotations

import re

CITY_LEVELS: dict[str, list[dict]] = {
    "ml": [
        {
            "id": "l1",
            "level": 1,
            "name": "Perceptron",
            "subtopics": ["Weights & Bias", "Activation Threshold", "Learning Rule"],
        },
        {
            "id": "l2",
            "level": 2,
            "name": "Linear Regression",
            "subtopics": ["Least Squares", "Gradient Descent", "Residuals"],
        },
        {
            "id": "l3",
            "level": 3,
            "name": "Logistic Regression",
            "subtopics": ["Sigmoid", "Decision Boundary", "Cross Entropy"],
        },
        {
            "id": "l4",
            "level": 4,
            "name": "Decision Trees",
            "subtopics": ["Splits & Impurity", "Pruning", "Feature Importance"],
        },
        {
            "id": "l5",
            "level": 5,
            "name": "SVM",
            "subtopics": ["Margins", "Kernels", "Support Vectors"],
        },
        {
            "id": "l6",
            "level": 6,
            "name": "K-Means Clustering",
            "subtopics": ["Centroids", "Assignment Step", "Choosing K"],
        },
        {
            "id": "l7",
            "level": 7,
            "name": "Neural Networks",
            "subtopics": ["Layers", "Forward Pass", "Nonlinearity"],
        },
        {
            "id": "l8",
            "level": 8,
            "name": "Backpropagation",
            "subtopics": ["Chain Rule", "Gradients", "Vanishing Gradients"],
        },
        {
            "id": "l9",
            "level": 9,
            "name": "CNNs",
            "subtopics": ["Convolution", "Pooling", "Feature Maps"],
        },
        {
            "id": "l10",
            "level": 10,
            "name": "RNNs",
            "subtopics": ["Sequences", "Hidden State", "LSTM / GRU"],
        },
    ],
    "ai": [
        {
            "id": "l1",
            "level": 1,
            "name": "Intelligent Agents",
            "subtopics": ["PEAS", "Environments", "Rationality"],
        },
        {
            "id": "l2",
            "level": 2,
            "name": "Search Algorithms",
            "subtopics": ["BFS / DFS", "A* Search", "Heuristics"],
        },
        {
            "id": "l3",
            "level": 3,
            "name": "Knowledge Representation",
            "subtopics": ["Logic", "Ontologies", "Frames"],
        },
        {
            "id": "l4",
            "level": 4,
            "name": "Natural Language Processing",
            "subtopics": ["Tokenization", "Embeddings", "Parsing"],
        },
        {
            "id": "l5",
            "level": 5,
            "name": "Computer Vision",
            "subtopics": ["Pixels & Filters", "Detection", "Segmentation"],
        },
        {
            "id": "l6",
            "level": 6,
            "name": "Planning",
            "subtopics": ["State Space", "STRIPS", "Hierarchical Plans"],
        },
        {
            "id": "l7",
            "level": 7,
            "name": "Probabilistic Reasoning",
            "subtopics": ["Bayes Nets", "HMMs", "Inference"],
        },
        {
            "id": "l8",
            "level": 8,
            "name": "Reinforcement Learning",
            "subtopics": ["MDPs", "Q-Learning", "Policy Gradients"],
        },
        {
            "id": "l9",
            "level": 9,
            "name": "Large Language Models",
            "subtopics": ["Transformers", "Prompting", "RAG"],
        },
        {
            "id": "l10",
            "level": 10,
            "name": "AI Safety & Ethics",
            "subtopics": ["Alignment", "Bias", "Robustness"],
        },
    ],
    "programming": [
        {
            "id": "l1",
            "level": 1,
            "name": "Variables & Types",
            "subtopics": ["Primitives", "References", "Type Systems"],
        },
        {
            "id": "l2",
            "level": 2,
            "name": "Control Flow",
            "subtopics": ["Branching", "Loops", "Recursion Basics"],
        },
        {
            "id": "l3",
            "level": 3,
            "name": "Functions",
            "subtopics": ["Parameters", "Scope", "Closures"],
        },
        {
            "id": "l4",
            "level": 4,
            "name": "Data Structures",
            "subtopics": ["Arrays & Lists", "Hash Maps", "Trees"],
        },
        {
            "id": "l5",
            "level": 5,
            "name": "Algorithms",
            "subtopics": ["Sorting", "Searching", "Big-O"],
        },
        {
            "id": "l6",
            "level": 6,
            "name": "OOP",
            "subtopics": ["Classes", "Inheritance", "Interfaces"],
        },
        {
            "id": "l7",
            "level": 7,
            "name": "Error Handling",
            "subtopics": ["Exceptions", "Logging", "Debugging"],
        },
        {
            "id": "l8",
            "level": 8,
            "name": "Testing",
            "subtopics": ["Unit Tests", "TDD", "Mocks"],
        },
        {
            "id": "l9",
            "level": 9,
            "name": "Concurrency",
            "subtopics": ["Threads", "Async / Await", "Locks"],
        },
        {
            "id": "l10",
            "level": 10,
            "name": "Systems & Craft",
            "subtopics": ["Memory", "Git Workflow", "Design Patterns"],
        },
    ],
    "web": [
        {
            "id": "l1",
            "level": 1,
            "name": "HTML Fundamentals",
            "subtopics": ["Elements", "Forms", "Semantics"],
        },
        {
            "id": "l2",
            "level": 2,
            "name": "CSS Layout",
            "subtopics": ["Box Model", "Flexbox", "Grid"],
        },
        {
            "id": "l3",
            "level": 3,
            "name": "JavaScript Basics",
            "subtopics": ["DOM", "Events", "ES Modules"],
        },
        {
            "id": "l4",
            "level": 4,
            "name": "Responsive Design",
            "subtopics": ["Media Queries", "Mobile First", "Accessibility"],
        },
        {
            "id": "l5",
            "level": 5,
            "name": "Frontend Frameworks",
            "subtopics": ["Components", "State", "Routing"],
        },
        {
            "id": "l6",
            "level": 6,
            "name": "HTTP & APIs",
            "subtopics": ["REST", "Fetch", "Status Codes"],
        },
        {
            "id": "l7",
            "level": 7,
            "name": "Backend Basics",
            "subtopics": ["Servers", "Routing", "Middleware"],
        },
        {
            "id": "l8",
            "level": 8,
            "name": "Databases",
            "subtopics": ["SQL", "ORMs", "Migrations"],
        },
        {
            "id": "l9",
            "level": 9,
            "name": "Auth & Security",
            "subtopics": ["Sessions", "JWT", "XSS / CSRF"],
        },
        {
            "id": "l10",
            "level": 10,
            "name": "Full-Stack Deploy",
            "subtopics": ["Build Tools", "Hosting", "CI/CD"],
        },
    ],
}


def get_city_levels(city: str) -> list[dict]:
    return CITY_LEVELS.get(city, [])


def get_level(city: str, level_id: str) -> dict | None:
    for level in get_city_levels(city):
        if level["id"] == level_id:
            return level
    return None


def building_id_for(city: str, level_id: str, subtopic: str, index: int) -> str:
    # Must match buildingIdFor() in frontend/src/levelCurriculum.js exactly.
    slug = re.sub(r"[^a-z0-9]+", "-", subtopic.lower()).strip("-")[:24]
    return f"{city}-{level_id}-s{index}-{slug}"
