console.log("Grade AI plugin loaded");

// Function to send instruction and answers to Gemini API for assessment
async function assessAnswersWithAI(instruction, answers) {
    const apiKey = "You wish";
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    // Create a prompt that instructs the AI to assess each answer
    const prompt = `Olet kokeen arviointiavustaja. Alla on koekysymyksen ohje ja opiskelijoiden vastaukset. 
Arvioi jokainen vastaus ohjeen perusteella ja anna yksityiskohtainen arvio kullekin.

Koekysymyksen ohje:
"${instruction}"

Opiskelijoiden vastaukset:
${answers.map((answer, index) => `Vastaus ${index + 1}: "${answer}"`).join("\n")}

Jokaiselle vastaukselle anna:
1. Pistemäärä (0-12)
2. Palaute (mikä sujui hyvin ja missä on parannettavaa)

Vastauksesi tulee olla pelkästään JSON-objekti, jolla on tämä rakenne (eli ensimmäinen merkki on "{" ja viimeinen "}"):
{
  "assessments": [
    {
      "answerId": 1,
      "score": <number>,
      "feedback": "<string>"
    }
  ]
}`;

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": apiKey
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("AI Response:", data);

        // Extract the assessment text from the response
        const assessmentText = data.candidates[0].content.parts[0].text;
        
        // Parse JSON from the response
        const jsonMatch = assessmentText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        } else {
            console.warn("Could not parse JSON from AI response");
            return { assessments: [] };
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return { assessments: [] };
    }
}


// Wait until DOM is ready
setTimeout(() => {
    console.log("DOM fully loaded and parsed");

    // Find all elements with class "findings-status" in tbody
    const targets = document.querySelectorAll("tbody .findings-status");
    if (targets.length === 0) {
        console.warn("No elements with class 'findings-status' found in tbody.");
        return;
    }

    // Insert new element before each findings-status element in tbody
    targets.forEach((target) => {
        // Create the new <td> element
        const td = document.createElement("td");
        td.className = "grading-links";

        // Create the <a> button
        const link = document.createElement("a");
        link.className = "button";
        link.textContent = "Grade with AI";

        // Find the sibling element with class schoolAnonCode
        const sibling = target.parentNode.querySelector(".schoolAnonCode");
        const schoolAnonCode = sibling ? sibling.textContent.trim() : '';

        // Set on click listener to print schoolAnonCode
        link.addEventListener("click", async () => {
            // Send get request to https://oma.abitti.fi/exam-api/grading/$schoolAnonCode/student-answers
            const url = `https://oma.abitti.fi/exam-api/grading/${schoolAnonCode}/student-answers`;
            const studentAnswersData = await fetch(url)
                .then(response => response.json())
                .catch(error => {
                    console.error("Error fetching student answers:", error);
                    alert(`Failed to fetch student answers for code ${schoolAnonCode}.`);
                });
            
            console.log("Student answers data!!!:", studentAnswersData.exam.examUuid);

            const examPreviewUrl = `https://oma.abitti.fi/exam-api/exams/${studentAnswersData.exam.examUuid}/exam`;
            const examPreviewData = await fetch(examPreviewUrl)
            .then(response => response.json())
            .catch(error => {
                console.error("Error generating exam preview:", error);
                alert(`Failed to generate exam preview for code ${schoolAnonCode}.`);
            });

            console.log("Exam preview data:", examPreviewData.contentXml);
            const examContent = examPreviewData.contentXml;

            // Parse examContent as XML to JS object
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(examContent, "application/xml");
            console.log("Parsed XML Document:", xmlDoc);

            // Go through each section element and within that go through each question element and take its instruction.
            const sections = xmlDoc.getElementsByTagName("e:section");
            const instructions = [];
            for (let i = 0; i < sections.length; i++) {
                const questions = sections[i].getElementsByTagName("e:question");
                for (let j = 0; j < questions.length; j++) {
                    const instruction = questions[j].getElementsByTagName("e:question-instruction")[0];
                    if (instruction) {
                        instructions.push(instruction.textContent.trim());
                    }
                }
            }
            console.log("Extracted Instructions:", instructions);

            for (let i = 0; i < instructions.length; i++) {
                const instruction = instructions[i];
                const answers = studentAnswersData.students.map(student => {
                    return student.answers[i].content.value;
                });
                console.log(`Question ${i + 1} Instruction:`, instruction);
                console.log(`Question ${i + 1} Answers:`, answers);

                // Send to AI endpoint for assessment
                const assessments = await assessAnswersWithAI(instruction, answers);
                console.log(`Question ${i + 1} Assessments:`, assessments);
                
                // Apply assessments to students
                // Apply comment

                for (let k = 0; k < assessments.assessments.length; k++) {
                    const assessment = assessments.assessments[k];
                    const student = studentAnswersData.students[k];
                    const answerId = student.answers[i].answerId;

                    // Send comment 
                    //https://oma.abitti.fi/exam-api/grading/comments/${answerId}
                    const commentUrl = `https://oma.abitti.fi/exam-api/grading/comments/${answerId}`;
                    const commentPayload = {
                        comment: assessment.feedback
                    };
                    await fetch(commentUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(commentPayload)
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        console.log(`Comment posted for answerId ${answerId}`);
                    })
                    .catch(error => {
                        console.error(`Error posting comment for answerId ${answerId}:`, error);
                    });

                    // Send score
                    const scoreUrl = `https://oma.abitti.fi/exam-api/grading/scores/${answerId}`;
                    const scorePayload = {
                        scoreValue: assessment.score,
                        versionNumber: null 
                    };
                    await fetch(scoreUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(scorePayload)
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        console.log(`Score posted for answerId ${answerId}`);
                    })
                    .catch(error => {
                        console.error(`Error posting score for answerId ${answerId}:`, error);
                    });
                }
            }
        });

        td.appendChild(link);

        // Insert <td> before the findings-status cell
        target.parentNode.insertBefore(td, target);
    });

    // Find all elements with class "findings-status" in thead
    const headTargets = document.querySelectorAll("thead .findings-status");
    headTargets.forEach((target) => {
        // Create an empty <th> element
        const th = document.createElement("th");
        th.className = "grading-links";

        // Insert <th> before the findings-status cell
        target.parentNode.insertBefore(th, target);
    });
}, 1000);