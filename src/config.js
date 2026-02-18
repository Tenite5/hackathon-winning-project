/**
 * @file config.js
 * @description Application constants — ranks, preset question banks, and environment config.
 */

'use strict';

const RANKS = [
    { name: 'Bronze', min: 0, max: 999, color: '#cd7f32' },
    { name: 'Silver', min: 1000, max: 1199, color: '#c0c0c0' },
    { name: 'Gold', min: 1200, max: 1399, color: '#ffd700' },
    { name: 'Platinum', min: 1400, max: 1599, color: '#e5e4e2' },
    { name: 'Diamond', min: 1600, max: 1799, color: '#b9f2ff' },
    { name: 'Master', min: 1800, max: 1999, color: '#9b59b6' },
    { name: 'Grandmaster', min: 2000, max: Infinity, color: '#e74c3c' },
];

const PRESET_QUESTIONS = {
    'hard-math': {
        name: 'ძნელი მათემატიკა',
        questions: [
            {
                question: 'log₈₁(27) = ?',
                options: ['0.75', '0.5', '0.199', '0.25'],
                correct: 0,
                difficulty: 'hard',
                explanation: '81 = 3⁴ and 27 = 3³, so log₈₁(27) = log₃⁴(3³) = 3/4 = 0.75.',
            },
            {
                question: 'თუ log₂(3) = a; log₂(5) = b, რისი ტოლია log₁₂(80)?',
                options: ['(b+4)/(a+2)', '2b/3a', '2a/5b', '(b+6)/(a+8)'],
                correct: 0,
                difficulty: 'hard',
                explanation: 'log₁₂(80) = log₂(80)/log₂(12). log₂(80) = log₂(16·5) = 4+b, log₂(12) = log₂(4·3) = 2+a. So it equals (b+4)/(a+2).',
            },
            {
                question: 'ქვემოთჩამოთვლილთაგან, რომელი რიცხვი არ არის y = √(log₉(6x+1) + log₁/₉(7x+1)) ფუნქციის განსაზღვრის არეში?',
                options: ['-0.1', '2', '1', '0.3'],
                correct: 0,
                difficulty: 'hard',
                explanation: 'For x = -0.1, 6(-0.1)+1 = 0.4 and 7(-0.1)+1 = 0.3. The domain requires the expression under the square root to be non-negative, which fails for x = -0.1.',
            },
            {
                question: 'სამკუთხა პრიზმის გვერდით წიბოებს შორის მანძილები, შესაბამისად, 3-ის, 4-ისა და 5-ის ტოლია. გვერდითი წიბოს სიგრძეა 6. რისი ტოლია პრიზმის მოცულობა?',
                options: ['36', '180', '18', '12'],
                correct: 0,
                difficulty: 'hard',
                explanation: 'The cross-section is a triangle with sides 3, 4, 5 (a right triangle). Its area = (3×4)/2 = 6. Volume = base area × height = 6 × 6 = 36.',
            },
            {
                question: 'კონუსის ღერძული კვეთის ფართობი ფუძის ფართობის ტოლია. რას უდრის კუთხის ტანგენსი მსახველსა და ფუძის სიბრტყეს შორის?',
                options: ['π (3.14...)', '1', '3', '2'],
                correct: 0,
                difficulty: 'hard',
                explanation: 'The axial cross-section area = r·h, and the base area = πr². Setting r·h = πr² gives h = πr, so tan(α) = h/r = π.',
            },
            {
                question: 'log₇(3), log₇(x), log₇(y), log₇(24) რიცხვები ამ თანმიმდევრობით ადგენს არითმეტიკულ პროგრესიას. რისი ტოლია x + y?',
                options: ['18', '72', '2.1', '25'],
                correct: 0,
                difficulty: 'hard',
                explanation: 'In AP: d = (log₇(24)-log₇(3))/3 = log₇(8)/3 = log₇(2). So log₇(x) = log₇(3)+log₇(2) = log₇(6) → x=6, log₇(y) = log₇(3)+2log₇(2) = log₇(12) → y=12. x+y=18.',
            },
            {
                question: 'lim (x→0) (√(1+2x) − 1) / 5x = ?',
                options: ['0.2', '0.75', '0.4', '0.13'],
                correct: 0,
                difficulty: 'hard',
                explanation: 'Using the approximation √(1+2x) ≈ 1+x for small x: (1+x−1)/5x = x/5x = 1/5 = 0.2.',
            },
            {
                question: 'თუ A(3;5), B(-1;8), C(7;5), იპოვეთ ABC სამკუთხედის C წვეროდან გავლებულ სიმაღლის სიგრძე.',
                options: ['2.4', '1.8', '2', '2.2'],
                correct: 0,
                difficulty: 'hard',
                explanation: 'AB line: 3x+4y-29=0 (from points A and B). Distance from C(7,5) = |3·7+4·5−29|/√(9+16) = |21+20−29|/5 = 12/5 = 2.4.',
            },
            {
                question: 'თუ f(x) = 18 / ∛x, რისი ტოლია f\'(x)?',
                options: ['-6 / (x · ∛x)', '6 / (x · ∛x)', '18 / (x · ∛x)', '-18 / (x · ∛x)'],
                correct: 0,
                difficulty: 'hard',
                explanation: 'f(x) = 18x^(-1/3). f\'(x) = 18·(-1/3)·x^(-4/3) = -6·x^(-4/3) = -6/(x·∛x).',
            },
        ],
    },
    'sat': {
        name: 'SAT',
        questions: [
            {
                question: 'While many people believe that chameleons change color solely to blend in with their _______ actually change color to regulate their body temperature or communicate with other chameleons.',
                options: ['surroundings, they', 'surroundings; they', 'surroundings. They', 'surroundings they'],
                correct: 0,
                difficulty: 'medium',
                explanation: 'A comma is needed to attach the dependent clause "While many people believe..." to the independent clause. A semicolon or period would create a fragment.',
            },
            {
                question: 'The collection of short stories, which includes works by both renowned authors and obscure writers, _______ praised by critics for its diverse representation.',
                options: ['was', 'are', 'have been', 'were'],
                correct: 0,
                difficulty: 'medium',
                explanation: 'The subject is "The collection" (singular). The intervening prepositional phrase doesn\'t change the subject number, so "was" (singular) is correct.',
            },
            {
                question: 'In the early 20th century, the _______ style was characterized by a distinct departure from the ornate details of the Victorian era.',
                options: ["architects'", 'architects', "architect's", "architects's"],
                correct: 0,
                difficulty: 'medium',
                explanation: 'We need the plural possessive: the style belonging to multiple architects. Plural "architects" + apostrophe after the s = architects\'.',
            },
            {
                question: 'Dr. Aris Thorne argues that the layout of a city is rarely _______; rather, it is usually the result of deliberate planning decisions.',
                options: ['haphazard', 'intentional', 'systematic', 'complex'],
                correct: 0,
                difficulty: 'medium',
                explanation: '"Rather" sets up a contrast with "deliberate." "Haphazard" (random, without plan) provides the correct contrast to deliberate planning.',
            },
            {
                question: 'Beaver dams increase biodiversity (Text 1) but may harm cold-water fish in slow streams (Text 2). How would Gauthier (Text 2) respond to Text 1?',
                options: [
                    'Benefits depend on specific environmental conditions like water flow and temperature',
                    'Beaver dams are universally harmful to all fish species',
                    'The biodiversity benefits mentioned in Text 1 may be overstated',
                    'Beavers are the single most important factor in freshwater health',
                ],
                correct: 0,
                difficulty: 'medium',
                explanation: 'Gauthier agrees dams are "generally beneficial" but qualifies this with specific conditions (slow-moving streams, cold-water species). This nuances rather than overturns Text 1.',
            },
            {
                question: 'Precision farming uses GPS and data analytics to reduce resource waste. Farmers adopting it are likely to _______.',
                options: [
                    'experience a decrease in their long-term operating costs',
                    'see an immediate reduction in their total debt',
                    'eliminate the need for manual labor entirely',
                    'produce crops that are more nutritious than those grown conventionally',
                ],
                correct: 0,
                difficulty: 'medium',
                explanation: 'The text states precision farming reduces resource waste (water, fertilizer). Less waste = lower ongoing costs. The high initial investment rules out immediate debt reduction.',
            },
        ],
    },
    'driving': {
        name: 'Driving License',
        questions: [
            {
                question: 'When two vehicles arrive at an uncontrolled intersection at approximately the same time, which driver has the right-of-way?',
                options: ['The driver on the right', 'The driver on the left', 'The driver driving the faster vehicle', 'The driver who signals first'],
                correct: 0,
                difficulty: 'easy',
                explanation: 'At an uncontrolled intersection, the vehicle on the right has the right-of-way. This is a fundamental traffic rule.',
            },
            {
                question: 'What is the safest action to take when your vehicle begins to hydroplane (skid across a wet road surface)?',
                options: [
                    'Ease off the accelerator and steer in the direction you want to go',
                    'Slam on the brakes immediately to stop the vehicle',
                    'Steer sharply toward the shoulder of the road',
                    'Accelerate slightly to gain traction',
                ],
                correct: 0,
                difficulty: 'easy',
                explanation: 'Easing off the accelerator reduces speed gradually while maintaining control. Braking or sharp steering can worsen the skid.',
            },
            {
                question: 'What does a flashing yellow traffic signal indicate?',
                options: ['Slow down and proceed with caution', 'You must come to a complete stop and proceed when safe', 'The traffic signal is broken; treat it as a four-way stop', 'Stop and wait for the light to turn green'],
                correct: 0,
                difficulty: 'easy',
                explanation: 'A flashing yellow light means slow down and proceed with caution. A flashing red light means stop. A non-functional signal should be treated as a four-way stop.',
            },
        ],
    },
};

const QUICK_GAME_TOPICS = [
    'General Knowledge', 'Science', 'History', 'Geography',
    'Pop Culture', 'Technology', 'Sports', 'Movies', 'Music', 'Literature',
];

module.exports = { RANKS, PRESET_QUESTIONS, QUICK_GAME_TOPICS };
