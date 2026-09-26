/**
 * Machine Learning city curriculum — streets, buildings, subtopics, quizzes.
 * Building height in the city = number of subtopics.
 */
function svgUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const IMG_NET = svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
  <rect width="640" height="320" fill="#0a1224"/>
  <circle cx="160" cy="160" r="28" fill="none" stroke="#3de7ff" stroke-width="3"/>
  <circle cx="320" cy="90" r="22" fill="none" stroke="#ffb347" stroke-width="3"/>
  <circle cx="320" cy="230" r="22" fill="none" stroke="#ffb347" stroke-width="3"/>
  <circle cx="480" cy="160" r="28" fill="none" stroke="#34d399" stroke-width="3"/>
  <path d="M188 160 L298 90 M188 160 L298 230 M342 90 L452 160 M342 230 L452 160" stroke="#e8eef8" stroke-width="2" opacity="0.7"/>
</svg>`)

const IMG_CHART = svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
  <rect width="640" height="320" fill="#0a1224"/>
  <polyline points="80,240 180,200 280,210 380,120 480,90 560,70" fill="none" stroke="#3de7ff" stroke-width="4"/>
  <line x1="80" y1="260" x2="560" y2="260" stroke="#5a6a88" stroke-width="2"/>
  <line x1="80" y1="60" x2="80" y2="260" stroke="#5a6a88" stroke-width="2"/>
</svg>`)

const IMG_CLUSTER = svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
  <rect width="640" height="320" fill="#0a1224"/>
  <circle cx="200" cy="140" r="8" fill="#3de7ff"/><circle cx="230" cy="160" r="8" fill="#3de7ff"/><circle cx="190" cy="180" r="8" fill="#3de7ff"/>
  <circle cx="420" cy="120" r="8" fill="#ffb347"/><circle cx="450" cy="140" r="8" fill="#ffb347"/><circle cx="430" cy="170" r="8" fill="#ffb347"/>
  <circle cx="320" cy="230" r="8" fill="#ff4d8d"/><circle cx="350" cy="250" r="8" fill="#ff4d8d"/>
</svg>`)

/** @typedef {{ id: string, title: string, body: string, image?: string }} Subtopic */
/** @typedef {{ prompt: string, choices: string[], correct: number }} QuizQ */
/** @typedef {{ id: string, name: string, blurb: string, subtopics: Subtopic[], quiz: QuizQ[] }} BuildingDef */
/** @typedef {{ id: string, name: string, color: string, buildings: BuildingDef[] }} StreetDef */

/** @type {StreetDef[]} */
export const ML_STREETS = [
  {
    id: 'ml-street',
    name: 'ML Street',
    color: '#3de7ff',
    buildings: [
      {
        id: 'ml-101',
        name: 'Machine Learning 101',
        blurb: 'What ML is and how learning from data works.',
        subtopics: [
          {
            id: 'what-is-ml',
            title: 'What is Machine Learning?',
            body: 'Machine learning finds patterns in data so systems can make predictions without being explicitly programmed for every case. You provide examples; the model learns a mapping from inputs to useful outputs.',
          },
          {
            id: 'train-predict',
            title: 'Train → Predict',
            body: 'A typical loop: collect labeled data, choose a model, train it by reducing error, then predict on new inputs. Features are measurable inputs; labels are the answers you want.',
            image: IMG_CHART,
          },
          {
            id: 'types',
            title: 'Types of Learning',
            body: 'Supervised learning uses labeled examples. Unsupervised learning finds structure without labels. Reinforcement learning learns from rewards over time.',
          },
        ],
        quiz: [
          {
            prompt: 'Machine learning models mainly learn from…',
            choices: ['Only hardcoded if-statements', 'Patterns in example data', 'Random guessing alone'],
            correct: 1,
          },
          {
            prompt: 'Features are…',
            choices: ['Final accuracy only', 'Input measurements the model uses', 'The optimizer name'],
            correct: 1,
          },
          {
            prompt: 'Supervised learning requires…',
            choices: ['Labeled examples', 'No data at all', 'Only unlabeled clusters'],
            correct: 0,
          },
        ],
      },
      {
        id: 'perceptron',
        name: 'Perceptron Hall',
        blurb: 'The classic building block of neural nets.',
        subtopics: [
          {
            id: 'neuron',
            title: 'A Tiny Decision Unit',
            body: 'A perceptron takes weighted inputs, sums them, and fires if the sum crosses a threshold. It is a linear classifier — simple, but foundational.',
            image: IMG_NET,
          },
          {
            id: 'weights',
            title: 'Weights & Bias',
            body: 'Weights scale each feature’s importance. Bias shifts the decision boundary. Learning adjusts these numbers so correct labels win more often.',
          },
          {
            id: 'limits',
            title: 'What It Cannot Do Alone',
            body: 'A single perceptron cannot solve XOR-style problems. Stacking layers (multi-layer networks) unlocks non-linear boundaries.',
          },
        ],
        quiz: [
          {
            prompt: 'A perceptron is best described as…',
            choices: ['A database index', 'A linear decision unit', 'A clustering algorithm'],
            correct: 1,
          },
          {
            prompt: 'Bias in a perceptron…',
            choices: ['Shifts the decision boundary', 'Deletes features', 'Stores images'],
            correct: 0,
          },
          {
            prompt: 'XOR is hard for one perceptron because…',
            choices: ['It needs a non-linear boundary', 'CPUs are too slow', 'Labels are always wrong'],
            correct: 0,
          },
        ],
      },
      {
        id: 'features-lab',
        name: 'Features Lab',
        blurb: 'Turning raw data into useful signals.',
        subtopics: [
          {
            id: 'raw-to-feat',
            title: 'From Raw Data to Features',
            body: 'Models rarely see “raw life.” We engineer numeric or categorical features that capture signal — ages, word counts, pixel intensities, embeddings.',
          },
          {
            id: 'scale',
            title: 'Scaling Matters',
            body: 'Many algorithms assume features share similar scales. Standardization or normalization keeps one loud feature from dominating the loss.',
            image: IMG_CHART,
          },
        ],
        quiz: [
          {
            prompt: 'Feature scaling helps because…',
            choices: ['It makes one feature dominate', 'It balances feature magnitudes', 'It removes the need for labels'],
            correct: 1,
          },
          {
            prompt: 'A feature is…',
            choices: ['An input signal for the model', 'Always the final prediction', 'Only the learning rate'],
            correct: 0,
          },
          {
            prompt: 'Embeddings are often used to…',
            choices: ['Represent text or categories as vectors', 'Compile C++', 'Encrypt passwords'],
            correct: 0,
          },
        ],
      },
    ],
  },
  {
    id: 'supervised-ave',
    name: 'Supervised Ave',
    color: '#ffb347',
    buildings: [
      {
        id: 'linear-regression',
        name: 'Linear Regression',
        blurb: 'Predict continuous values with a line (or hyperplane).',
        subtopics: [
          {
            id: 'line-fit',
            title: 'Fitting a Line',
            body: 'Linear regression predicts a number as a weighted sum of features. Training finds weights that minimize squared error on the training set.',
            image: IMG_CHART,
          },
          {
            id: 'loss',
            title: 'Loss & Gradient',
            body: 'Mean squared error measures how far predictions miss. Gradients tell us how to nudge weights downhill on that error surface.',
          },
          {
            id: 'overfit',
            title: 'Underfit vs Overfit',
            body: 'Too simple → underfit. Too flexible / too little data → overfit. Regularization and validation splits help find the balance.',
          },
        ],
        quiz: [
          {
            prompt: 'Linear regression usually predicts…',
            choices: ['A continuous value', 'Only cluster IDs', 'A random password'],
            correct: 0,
          },
          {
            prompt: 'MSE stands for…',
            choices: ['Mean Squared Error', 'Most Similar Entity', 'Model Stacking Engine'],
            correct: 0,
          },
          {
            prompt: 'Overfitting means…',
            choices: ['Memorizes train data, weak on new data', 'Never fits the train set', 'Needs no features'],
            correct: 0,
          },
        ],
      },
      {
        id: 'svm',
        name: 'SVM Tower',
        blurb: 'Maximum-margin classifiers.',
        subtopics: [
          {
            id: 'margin',
            title: 'Maximum Margin',
            body: 'Support Vector Machines pick a boundary that maximizes the gap between classes. Points that define the margin are the support vectors.',
          },
          {
            id: 'kernel',
            title: 'Kernels',
            body: 'Kernels let SVMs work in higher-dimensional feature spaces without building them explicitly — useful for non-linear separation.',
            image: IMG_NET,
          },
        ],
        quiz: [
          {
            prompt: 'SVMs emphasize…',
            choices: ['Maximum margin between classes', 'Random forests only', 'Unsupervised PCA only'],
            correct: 0,
          },
          {
            prompt: 'Support vectors are…',
            choices: ['Points that define the margin', 'GPU shaders', 'Loss-free labels'],
            correct: 0,
          },
          {
            prompt: 'A kernel helps an SVM…',
            choices: ['Handle non-linear boundaries', 'Download datasets faster', 'Skip validation'],
            correct: 0,
          },
        ],
      },
      {
        id: 'decision-trees',
        name: 'Decision Trees',
        blurb: 'If-then rules learned from data.',
        subtopics: [
          {
            id: 'splits',
            title: 'Splitting Features',
            body: 'Trees ask a sequence of yes/no questions about features, partitioning the data until leaves make confident predictions.',
          },
          {
            id: 'impurity',
            title: 'Impurity',
            body: 'Good splits reduce impurity (e.g. Gini or entropy) so each child node is purer than its parent.',
          },
          {
            id: 'ensemble',
            title: 'Toward Forests',
            body: 'Single trees overfit easily. Bagging many trees (Random Forests) usually generalizes better.',
            image: IMG_CLUSTER,
          },
        ],
        quiz: [
          {
            prompt: 'Decision trees partition data using…',
            choices: ['Feature-based splits', 'Only Fourier transforms', 'Manual SQL joins'],
            correct: 0,
          },
          {
            prompt: 'Gini/entropy measure…',
            choices: ['Node impurity', 'GPU temperature', 'File size'],
            correct: 0,
          },
          {
            prompt: 'Random Forests help by…',
            choices: ['Averaging many trees', 'Deleting all features', 'Removing validation'],
            correct: 0,
          },
        ],
      },
      {
        id: 'knn',
        name: 'k-NN Loft',
        blurb: 'Classify by nearby neighbors.',
        subtopics: [
          {
            id: 'neighbors',
            title: 'Vote of the Neighbors',
            body: 'k-Nearest Neighbors labels a point by the majority label among its k closest training examples in feature space.',
          },
          {
            id: 'distance',
            title: 'Distance Metrics',
            body: 'Euclidean distance is common, but scaled features and alternate metrics can change who counts as “near.”',
          },
        ],
        quiz: [
          {
            prompt: 'k-NN classifies using…',
            choices: ['Nearby labeled examples', 'Only neural backprop', 'Hardcoded XML'],
            correct: 0,
          },
          {
            prompt: 'Choosing k too small can…',
            choices: ['Make predictions noisy', 'Always maximize margin', 'Remove features'],
            correct: 0,
          },
          {
            prompt: 'Feature scaling matters for k-NN because…',
            choices: ['Distance depends on feature magnitudes', 'Trees ignore scale always', 'It trains GPUs'],
            correct: 0,
          },
        ],
      },
    ],
  },
  {
    id: 'unsupervised-blvd',
    name: 'Unsupervised Blvd',
    color: '#34d399',
    buildings: [
      {
        id: 'kmeans',
        name: 'K-Means Hub',
        blurb: 'Cluster points into k groups.',
        subtopics: [
          {
            id: 'centroids',
            title: 'Centroids',
            body: 'K-Means assigns points to the nearest centroid, then moves centroids to the mean of their assigned points — repeating until stable.',
            image: IMG_CLUSTER,
          },
          {
            id: 'choose-k',
            title: 'Choosing k',
            body: 'k is a hyperparameter. Elbow plots and domain knowledge help. Bad k or scale can produce meaningless blobs.',
          },
        ],
        quiz: [
          {
            prompt: 'K-Means is primarily used for…',
            choices: ['Clustering unlabeled data', 'Captioning videos only', 'Compiling kernels'],
            correct: 0,
          },
          {
            prompt: 'A centroid is…',
            choices: ['A cluster center', 'A quiz score', 'A street name'],
            correct: 0,
          },
          {
            prompt: 'K-Means needs…',
            choices: ['A chosen number of clusters k', 'Labeled classes always', 'No features'],
            correct: 0,
          },
        ],
      },
      {
        id: 'pca',
        name: 'PCA Pavilion',
        blurb: 'Compress dimensions, keep variance.',
        subtopics: [
          {
            id: 'variance',
            title: 'Principal Directions',
            body: 'PCA finds orthogonal directions that capture the most variance, letting you project high-dimensional data into fewer axes.',
            image: IMG_CHART,
          },
          {
            id: 'use',
            title: 'Why Use PCA?',
            body: 'Visualization, noise reduction, and speeding up downstream models — with the tradeoff of less interpretable axes.',
          },
        ],
        quiz: [
          {
            prompt: 'PCA mainly…',
            choices: ['Finds high-variance directions', 'Trains Q-learning agents', 'Writes SQL'],
            correct: 0,
          },
          {
            prompt: 'Reducing dimensions with PCA can help…',
            choices: ['Visualization and speed', 'Increase label noise always', 'Delete the dataset'],
            correct: 0,
          },
          {
            prompt: 'PCA components are…',
            choices: ['Orthogonal directions of variance', 'Random passwords', 'Street lamps'],
            correct: 0,
          },
        ],
      },
    ],
  },
  {
    id: 'neural-ave',
    name: 'Neural Net Ave',
    color: '#a78bfa',
    buildings: [
      {
        id: 'mlp',
        name: 'MLP Tower',
        blurb: 'Multi-layer perceptrons & backprop.',
        subtopics: [
          {
            id: 'layers',
            title: 'Layers & Activations',
            body: 'Stack linear transforms with non-linear activations (ReLU, sigmoid). Depth lets networks approximate complex functions.',
            image: IMG_NET,
          },
          {
            id: 'backprop',
            title: 'Backpropagation',
            body: 'Backprop uses the chain rule to compute gradients of the loss w.r.t. every weight, enabling gradient descent training.',
          },
          {
            id: 'regularize',
            title: 'Keep It General',
            body: 'Dropout, weight decay, and early stopping fight overfitting when networks have millions of parameters.',
          },
        ],
        quiz: [
          {
            prompt: 'Activations add…',
            choices: ['Non-linearity between layers', 'More SQL tables', 'Street names'],
            correct: 0,
          },
          {
            prompt: 'Backprop computes…',
            choices: ['Gradients for weight updates', 'Only cluster IDs', 'CSS layouts'],
            correct: 0,
          },
          {
            prompt: 'Dropout helps by…',
            choices: ['Reducing overfitting', 'Increasing train memorization always', 'Removing the loss'],
            correct: 0,
          },
        ],
      },
      {
        id: 'cnn-intro',
        name: 'CNN Studio',
        blurb: 'Convolutional nets for grid-like data.',
        subtopics: [
          {
            id: 'conv',
            title: 'Convolutions',
            body: 'CNNs slide small filters across images, detecting local patterns (edges, textures) with far fewer parameters than dense layers.',
            image: IMG_NET,
          },
          {
            id: 'pool',
            title: 'Pooling',
            body: 'Pooling downsamples feature maps, buying some translation tolerance and shrinking compute for deeper layers.',
          },
        ],
        quiz: [
          {
            prompt: 'CNNs are especially good for…',
            choices: ['Grid data like images', 'Sorting integers only', 'DNS lookup'],
            correct: 0,
          },
          {
            prompt: 'A convolution filter detects…',
            choices: ['Local patterns', 'Global SQL keys', 'Random seeds only'],
            correct: 0,
          },
          {
            prompt: 'Pooling typically…',
            choices: ['Downsamples feature maps', 'Adds more labels', 'Deletes gradients forever'],
            correct: 0,
          },
        ],
      },
    ],
  },
  {
    id: 'rl-street',
    name: 'RL Street',
    color: '#ff4d8d',
    buildings: [
      {
        id: 'bandits',
        name: 'Bandits Arcade',
        blurb: 'Explore vs exploit with rewards.',
        subtopics: [
          {
            id: 'explore',
            title: 'Explore vs Exploit',
            body: 'Multi-armed bandits balance trying new actions (explore) and repeating what works (exploit) to maximize cumulative reward.',
          },
          {
            id: 'epsilon',
            title: 'ε-Greedy',
            body: 'With probability ε, pick a random action; otherwise pick the current best. Simple and surprisingly strong as a baseline.',
          },
        ],
        quiz: [
          {
            prompt: 'Bandits focus on…',
            choices: ['Explore vs exploit tradeoffs', 'Only image filters', 'HTML parsing'],
            correct: 0,
          },
          {
            prompt: 'ε-greedy sometimes…',
            choices: ['Picks a random action', 'Deletes the reward', 'Skips all features'],
            correct: 0,
          },
          {
            prompt: 'Reward in bandits is…',
            choices: ['Feedback for an action', 'Always a neural weight', 'A street lamp'],
            correct: 0,
          },
        ],
      },
      {
        id: 'q-learning',
        name: 'Q-Learning Depot',
        blurb: 'Learn action values over time.',
        subtopics: [
          {
            id: 'qtable',
            title: 'Q-Values',
            body: 'Q-learning estimates how good it is to take an action in a state. Updates bootstrap from the best next-action estimate.',
            image: IMG_CHART,
          },
          {
            id: 'mdp',
            title: 'States & Actions',
            body: 'Problems are often framed as MDPs: states, actions, transitions, and rewards. Policies map states to actions.',
          },
          {
            id: 'deep-rl',
            title: 'Toward Deep RL',
            body: 'When state spaces are huge, neural nets approximate Q-values (DQN and friends) instead of a literal table.',
          },
        ],
        quiz: [
          {
            prompt: 'Q-learning estimates…',
            choices: ['Action values in states', 'Only PCA axes', 'CSS colors'],
            correct: 0,
          },
          {
            prompt: 'An MDP includes…',
            choices: ['States, actions, rewards', 'Only HTML tags', 'Git commit hashes'],
            correct: 0,
          },
          {
            prompt: 'Deep RL often replaces Q-tables with…',
            choices: ['Neural approximations', 'Paper notebooks only', 'Street signs'],
            correct: 0,
          },
        ],
      },
    ],
  },
]

export const ML_DISTRICT = {
  id: 'ml',
  label: 'Machine Learning',
  description: 'Fly a plane through topic towers — learn, quiz, grow the central tower.',
}

export const DISTRICT_CARDS = [
  {
    id: 'ml',
    label: 'Machine Learning',
    description: 'Supervised, unsupervised, neural nets & RL — each building is a topic.',
    enabled: true,
    accent: '#3de7ff',
  },
  {
    id: 'web',
    label: 'Web Dev',
    description: 'HTML, CSS, JS, and APIs as a neon downtown. Coming next.',
    enabled: false,
    accent: '#ffb347',
  },
  {
    id: 'security',
    label: 'Security',
    description: 'Auth, crypto, and defense towers on a hardened skyline. Coming next.',
    enabled: false,
    accent: '#ff4d8d',
  },
]

export function getAllMlBuildings() {
  return ML_STREETS.flatMap((street) =>
    street.buildings.map((b) => ({
      ...b,
      streetId: street.id,
      streetName: street.name,
      streetColor: street.color,
      subtopicCount: b.subtopics.length,
    })),
  )
}

export function getBuilding(buildingId) {
  for (const street of ML_STREETS) {
    const found = street.buildings.find((b) => b.id === buildingId)
    if (found) {
      return {
        ...found,
        streetId: street.id,
        streetName: street.name,
        streetColor: street.color,
        subtopicCount: found.subtopics.length,
      }
    }
  }
  return null
}
