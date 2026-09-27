"""
Level -> DoIT dataset skill tags (vocabulary of role_skill_tags in employment_history.csv).
Used to derive per-island career outcomes.
"""

LEVEL_SKILLS: dict[str, dict[str, list[str]]] = {
    "ml": {
        "l1": ["Machine Learning", "Linear Algebra", "Python"],
        "l2": ["Statistics", "Predictive Modeling", "R"],
        "l3": ["Predictive Modeling", "Probability", "Statistics"],
        "l4": ["Data Mining", "Predictive Modeling", "Visualization"],
        "l5": ["Machine Learning", "Linear Algebra", "Matrix Computation"],
        "l6": ["Data Mining", "Business Intelligence", "Visualization"],
        "l7": ["Deep Learning", "Machine Learning", "PyTorch"],
        "l8": ["Deep Learning", "Matrix Computation", "Linear Algebra"],
        "l9": ["Deep Learning", "GPU Computing", "PyTorch"],
        "l10": ["Deep Learning", "NLP", "PyTorch"],
    },
    "ai": {
        "l1": ["AI", "Problem Solving", "Software Design"],
        "l2": ["Search Algorithms", "Algorithms", "Problem Solving"],
        "l3": ["Data Modeling", "Systems Analysis", "AI"],
        "l4": ["NLP", "Machine Learning", "Python"],
        "l5": ["Deep Learning", "GPU Computing", "Matrix Computation"],
        "l6": ["Search Algorithms", "AI", "Algorithms"],
        "l7": ["Probability", "Statistics", "Predictive Modeling"],
        "l8": ["Machine Learning", "Probability", "GPU Computing"],
        "l9": ["NLP", "Deep Learning", "PyTorch"],
        "l10": ["Governance", "Risk Assessment", "Compliance"],
    },
    "programming": {
        "l1": ["Python", "Java", "C++"],
        "l2": ["Problem Solving", "Algorithms", "Python"],
        "l3": ["Software Design", "JavaScript", "Python"],
        "l4": ["Data Structures", "Algorithms"],
        "l5": ["Algorithms", "Performance Analysis", "Search Algorithms"],
        "l6": ["Object-Oriented Design", "Java", "UML"],
        "l7": ["Testing", "Quality Assurance", "Automation"],
        "l8": ["Testing", "Quality Assurance", "CI/CD"],
        "l9": ["Concurrency", "Distributed Systems", "Operating Systems"],
        "l10": ["Version Control", "Git", "Operating Systems", "Software Design"],
    },
    "web": {
        "l1": ["JavaScript", "Web Frameworks", "Technical Writing"],
        "l2": ["Web Frameworks", "User Research", "JavaScript"],
        "l3": ["JavaScript", "Web Frameworks"],
        "l4": ["User Research", "Web Frameworks", "Quality Assurance"],
        "l5": ["Web Frameworks", "JavaScript", "Software Design"],
        "l6": ["REST APIs", "Networking", "TCP/IP"],
        "l7": ["REST APIs", "Linux", "Distributed Systems"],
        "l8": ["SQL", "Database Design", "Query Optimization"],
        "l9": ["Security Protocols", "Cryptography", "Network Security"],
        "l10": ["CI/CD", "Cloud", "Containers", "Infrastructure as Code"],
    },
}
