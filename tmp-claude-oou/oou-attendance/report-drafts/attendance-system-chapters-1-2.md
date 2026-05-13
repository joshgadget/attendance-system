# DEVELOPMENT OF A WEB-BASED CLASS ATTENDANCE MANAGEMENT SYSTEM

## CHAPTER ONE

# INTRODUCTION

## 1.0 Introduction

Attendance is an important part of academic administration in schools, polytechnics, and universities because it helps to measure students' participation, punctuality, and commitment to classroom activities. It also provides useful records for lecturers, departments, and school management when making decisions on academic monitoring, continuous assessment, and student discipline. In many institutions, however, attendance is still taken manually through paper registers, signature sheets, or verbal roll call. Although this method is common, it is often slow, stressful, and prone to error.

The development of information and communication technology has created better ways of managing attendance. Web-based systems now make it possible to store attendance records centrally, retrieve them easily, and process them more efficiently than manual methods. When such systems are combined with QR code technology, session validation, and secure login, they can reduce impersonation, improve speed, and provide more reliable attendance records.

This project focuses on the development of a web-based class attendance management system. The system is designed to support administrators, lecturers, and students through a centralized platform where attendance sessions can be created, monitored, and recorded more effectively. This chapter presents the background of the study, problem statement, aim and objectives, scope of the study, and justification of the study.

## 1.1 Background of the Study

Attendance management has remained a major concern in academic institutions because class attendance is closely linked to teaching effectiveness, student participation, and institutional record keeping. Traditionally, attendance has been recorded manually by lecturers using paper sheets or attendance registers. While this method may appear simple, it becomes less effective in large classes where time is limited and the number of students is high.

Ali et al. (2022) explained that traditional attendance methods are time-consuming and inefficient, especially in organizations and universities where attendance data is expected to be reliable and easily retrievable. Their systematic review further showed that manual methods often suffer from record loss, unauthorized signing, and weak accountability. This makes them unsuitable for institutions seeking speed, transparency, and proper monitoring.

The increasing use of digital technology in education has encouraged the development of automated attendance management systems. Talip and Zulkifli (2019) noted that QR code technology offers a practical and low-cost method of automating attendance in academic environments. According to them, QR code attendance improves attendance processing and reduces the stress associated with conventional paper-based systems.

In a related study, Iskandar et al. (2022) observed that many institutions still rely on conventional attendance procedures, even though these methods allow human error and fraud. Their work on a web-based student attendance information system showed that integrating QR codes with a website-based platform can improve attendance documentation and reduce the weaknesses of manual recording.

Ikhsan and Helmina (2024) also found that manual attendance control creates documentation problems and administrative inefficiency. In their study on lecturer attendance, they showed that a web-based QR code attendance system could simplify attendance management and reduce operational errors. Their work further confirms the growing relevance of web technologies in academic record management.

Attendance systems have also developed beyond simple web forms into more advanced smart systems. Badmus et al. (2021) proposed a fingerprint and RFID-based attendance system in order to improve confidentiality, identity verification, and data protection. Likewise, Sunaryono et al. (2021) developed an Android-based course attendance system that combined face recognition with QR code course information to strengthen attendance validation. Although these systems are effective, they often depend on special hardware or more complex infrastructure.

Nguyen et al. (2022) proposed an Internet of Things-based intelligent attendance system that combined QR code, face recognition, web application support, and cloud services. Their study showed that attendance management can be extended into a broader smart monitoring environment. Similarly, Rahaman et al. (2025) introduced a Wi-Fi-based online attendance management system that used smartphones and centralized data storage to improve real-time attendance monitoring and classroom management.

These studies show that attendance management has moved from paper-based recording to technology-supported systems that are faster, more secure, and easier to manage. However, many existing solutions are either too expensive, too hardware-dependent, or too specialized for a single use case. There is therefore a need for a practical system that combines the simplicity of web access with the efficiency of QR code-based attendance and centralized academic record management.

This project is based on that need. It proposes the development of a web-based class attendance management system that supports class attendance through role-based access, QR code session generation, centralized storage, and improved monitoring for administrators, lecturers, and students.

## 1.2 Problem Statement

Many tertiary institutions still depend on manual attendance systems that are inefficient, stressful, and vulnerable to manipulation. In large classes, lecturers spend valuable lecture time calling names or passing attendance sheets from one student to another. This reduces the time available for teaching and may also lead to incomplete or inaccurate records.

Manual attendance methods also create opportunities for impersonation and fraud. Students may sign for absent classmates, attendance sheets may be misplaced, and retrieving old records can become difficult. Ali et al. (2022) identified these weaknesses as common limitations of traditional attendance systems and one of the major reasons institutions are shifting toward automated solutions.

Another problem is the lack of centralization in attendance management. In many institutions, attendance data is separated from student records, course information, and administrative reporting. This makes it difficult for school authorities and lecturers to track attendance history properly or generate reports efficiently.

Furthermore, many institutions require a more secure system that can confirm not only that attendance was submitted, but that it was submitted by the right student for the right class session. Basic manual methods and loosely controlled digital methods cannot provide this level of assurance.

The problem addressed in this study is therefore the absence of a reliable, secure, and efficient web-based class attendance management system that can reduce manual workload, improve record accuracy, discourage impersonation, and provide better monitoring and reporting in the academic environment.

## 1.3 Aim and Objectives

The main aim of this project is to develop a web-based class attendance management system.

The specific objectives of the study are to:

1. design and develop a web-based attendance platform for academic use;
2. create a centralized system for managing student, lecturer, and administrator access;
3. enable lecturers to create attendance sessions for courses;
4. generate QR codes and session codes for attendance marking;
5. allow students to mark attendance through a secure and convenient process;
6. reduce impersonation and attendance fraud through controlled session validation;
7. store and retrieve attendance records efficiently for monitoring and reporting; and
8. improve the speed, reliability, and transparency of class attendance management.

## 1.4 Scope of the Study

This study is limited to the development of a web-based class attendance management system for use in an academic environment. The system is designed to cover the following areas:

1. user authentication and login management;
2. role-based access for administrators, lecturers, and students;
3. course and session management;
4. QR code and session code generation for attendance sessions;
5. attendance marking by students;
6. centralized attendance record storage;
7. attendance history review and reporting; and
8. basic administrative monitoring of attendance data.

The study does not cover advanced biometric hardware such as dedicated fingerprint terminals, facial recognition cameras, or full institutional enterprise integration. It is focused mainly on a practical web-based system that can be used through common digital devices.

## 1.5 Justification of the Study

This study is justified by the need to improve the way attendance is managed in academic institutions. Manual attendance methods are no longer sufficient for many modern classrooms because they waste time, create room for errors, and make long-term record management difficult.

Ali et al. (2022) showed that automated attendance systems are increasingly important because they improve monitoring and reduce the disadvantages of traditional attendance methods. Talip and Zulkifli (2019) also demonstrated that QR code-based attendance is affordable and practical for educational settings. Iskandar et al. (2022) further emphasized that website-based attendance systems can reduce fraud and human error in attendance recording.

The proposed system is also justified because it offers a balance between simplicity and effectiveness. Unlike some attendance solutions that require expensive hardware, a web-based QR code system can be implemented more easily and maintained at lower cost. At the same time, it provides significant improvements in speed, record keeping, accessibility, and transparency.

Finally, the study is justified because it contributes to the digital transformation of academic administration. A well-designed web-based class attendance management system can help lecturers, students, and school management handle attendance in a more professional, efficient, and secure manner.

## CHAPTER TWO

# LITERATURE REVIEW

## 2.0 Introduction

This chapter reviews relevant literature related to attendance management systems, with emphasis on manual, automated, web-based, QR code-based, biometric, and hybrid attendance solutions. The review is important because it shows how attendance systems have evolved over time, what methods researchers have used, the strengths and weaknesses of existing systems, and the gap this project intends to fill. In this study, attention is focused on systems that improve speed, accuracy, accountability, and ease of use in academic attendance management.

## 2.1 Evolution of Attendance Management Systems

Attendance management started with traditional manual methods such as paper registers, signature sheets, and roll-call recording. These methods were widely used in schools and organizations because they were simple to implement. However, they gradually became problematic as class sizes increased and institutions required faster, more reliable, and more secure ways of keeping records.

Ali et al. (2022), in their systematic literature review of automated attendance management systems, observed that manual attendance methods are time-consuming, inefficient, and vulnerable to impersonation and record loss. Their review showed that the evolution of attendance systems has moved from conventional manual methods to automated systems based on barcode, RFID, biometric verification, and web-based technologies.

Talip and Zulkifli (2019) explained that QR code technology has become attractive in attendance management because it is cheaper and easier to use than RFID in many academic environments. Their study showed that combining web-based and mobile technologies can improve attendance processing in universities.

Similarly, Iskandar et al. (2022) noted that many higher institutions still depend on conventional attendance systems despite the availability of digital alternatives. They argued that this dependence creates opportunities for human error and fraud, thereby justifying the move toward web-based QR-supported attendance solutions.

From these studies, it is clear that attendance systems have developed from slow and paper-based methods to smarter digital systems that support automation, real-time processing, and centralized storage.

## 2.2 Importance of Accurate Attendance Monitoring in Educational Institutions

Attendance monitoring is an important part of academic administration because it provides measurable evidence of student participation. Regular attendance is often linked to academic engagement, continuity in learning, and improved performance. When attendance data is properly captured and analyzed, lecturers and school administrators can identify trends such as frequent absenteeism, late participation, or weak engagement in specific courses.

Ali et al. (2022) emphasized that attendance systems are critical tools in organizations and universities because they help in tracking, monitoring, and evaluating participation. They further explained that automated attendance systems improve efficiency and reduce weaknesses associated with traditional methods.

Rahaman et al. (2025), in their SmartPresence study, argued that attendance management is no longer just about marking presence or absence, but about improving classroom management and student performance monitoring. Their Wi-Fi-based attendance solution was designed to replace paper signatures with a centralized real-time system that instantly notifies administrators and teachers.

Ikhsan and Helmina (2024) also showed that poor attendance control can affect institutional administration, especially when attendance data is linked to accountability and payments. Their study on lecturer attendance demonstrated that poor manual control leads to recording errors and operational inefficiency.

These studies show that accurate attendance monitoring is necessary not only for classroom control, but also for institutional planning, transparency, and academic quality assurance.

## 2.3 Review of Web-Based Attendance Management System Design

Several researchers have proposed web-based attendance systems to improve speed, accessibility, and data management.

Iskandar et al. (2022) developed a web-based student attendance information system that used QR codes as an auxiliary medium. Their study was motivated by the persistence of conventional attendance methods in tertiary institutions, which allowed human error and fraud. They concluded that a website-based QR attendance system can reduce these weaknesses and improve data capture.

Ikhsan and Helmina (2024) designed a web-based lecturer attendance information system using QR codes at Muhammadiyah University of Jambi. Their study found that lecturer attendance was still being controlled manually and that this created problems in documentation and payment processes. They concluded that a web-based QR attendance solution would simplify attendance taking and reduce recording errors.

Talip and Zulkifli (2019) proposed a mobile attendance system using QR code technology and reported that the method improved the process of taking student attendance in a university environment. Their work supports the idea that QR code attendance systems are practical and low-cost.

Nguyen et al. (2022) proposed an Internet of Things-based intelligent attendance system that combined facial recognition, QR code, a web server, cloud support, and non-contact body temperature sensing. Their work showed that attendance systems can be extended beyond simple classroom use into broader smart monitoring environments.

Rahaman et al. (2025) designed SmartPresence, a Wi-Fi-based online attendance system for academic use. Their approach used smartphones and Wi-Fi signals to register attendance and store records centrally in real time. This study is important because it shows that attendance systems can move beyond QR code scanning into network-based intelligent presence detection.

Although these systems are effective in different ways, many of them are either too specialized, hardware-dependent, or focused on only one category of users. This creates a need for a more balanced web-based system that supports students, lecturers, and administrators together in one platform.

## 2.4 Terminology

The following terms are central to this study:

**Attendance Management System:** A software-based system used to record, monitor, and report the presence or absence of users in an institution.

**Web-Based System:** A system accessed through a browser over a network without requiring heavy installation on each user device.

**QR Code:** A machine-readable code that stores encoded information and can be scanned quickly using a mobile device or camera.

**Session Code:** A unique code generated for a particular attendance session and used for attendance verification.

**Biometric Attendance:** Attendance recording based on human biological characteristics such as fingerprint or face recognition.

**RFID:** Radio Frequency Identification technology used to detect tagged users through radio signals.

**Geofencing:** A location-based restriction that allows a system action only when a user is within a defined geographic boundary.

**Role-Based Access Control:** A security method that allows users to access only the functions assigned to their roles, such as admin, lecturer, or student.

## 2.4.1 Manual Attendance Versus Automated Attendance Systems

Manual attendance systems depend entirely on human effort. They usually involve paper registers, signature lists, or roll-call processes. Their major weakness is that they consume time, allow impersonation, and make long-term storage difficult.

Ali et al. (2022) noted that one major reason for the growth of automated attendance systems is the weakness of manual attendance processes, especially their slow speed and vulnerability to misuse.

Talip and Zulkifli (2019) also argued that QR code technology offers a more efficient alternative to manual attendance because it is cheap, easy to use, and suitable for integration into mobile and web systems.

Badmus et al. (2021) went further by proposing a smart fingerprint biometric and RFID-based attendance system. Their study showed that hybrid systems offer stronger confidentiality, identity verification, and data protection than simpler attendance models. However, such systems also require hardware infrastructure.

This comparison shows that while manual attendance is simpler at the beginning, automated systems are better suited to modern institutions that need speed, security, and proper record management.

## 2.5 Components of an Attendance Management System

An attendance management system is made up of several interacting components that together ensure proper operation.

## 2.5.1 User and Access Management

A good attendance system must manage different users securely. These users may include administrators, lecturers, and students. Each user category should have different permissions.

Ali et al. (2022) identified automated attendance systems as part of broader institutional information systems, meaning they must support secure management of identities and user activities.

In a practical academic system, administrators manage accounts and settings, lecturers create and monitor sessions, while students mark attendance and review their records. This role separation improves both usability and security.

## 2.5.2 Course, Registry, and Enrollment Management

Attendance must be connected to actual academic records. A student should only be able to mark attendance for a course in which the student is registered.

Iskandar et al. (2022) highlighted the importance of structured academic data when building attendance systems, especially in school settings where errors can easily occur if records are not linked properly.

This means that a reliable web-based attendance management system should include student identity records, course allocation, and enrollment data before attendance marking begins.

## 2.5.3 Session Creation and QR Code Generation

A session is a defined attendance event created for a course at a particular date and time. In many modern systems, the system generates a QR code for that session.

Talip and Zulkifli (2019) showed that QR codes can serve as a practical mechanism for automating attendance. Ikhsan and Helmina (2024) similarly used QR codes to simplify attendance recording in a web-based lecturer attendance system.

Session generation is important because it makes attendance time-specific and course-specific, reducing the possibility of random or fraudulent submission.

## 2.5.4 Attendance Capture and Validation

Attendance capture refers to the actual process through which presence is recorded. This may be done through QR code scanning, biometric authentication, Wi-Fi detection, or manual code entry.

Badmus et al. (2021) emphasized validation and identity verification in their fingerprint-RFID model. Sunaryono et al. (2021) also combined QR code course information with face recognition to ensure that the correct student was present for the correct course.

These studies suggest that attendance capture is most reliable when it is combined with a verification layer rather than simple open submission.

## 2.6 Attendance Marking Methods

Different attendance marking methods have been used in existing systems, and each has strengths and limitations.

Badmus et al. (2021) used fingerprint and RFID to strengthen security. Their approach provides strong verification but depends on dedicated hardware and setup cost.

Sunaryono et al. (2021) proposed an Android-based attendance system using face recognition, while also generating QR code course information for classroom use. They reported a face recognition accuracy of 97.29%, showing that hybrid attendance validation can be highly effective.

Talip and Zulkifli (2019) used QR code technology because of its affordability and ease of deployment. Their work supports the use of QR code systems in environments where low cost and quick implementation are important.

Rahaman et al. (2025) introduced Wi-Fi-based attendance, which removes the need for manual scanning but depends on stable network conditions and device connectivity.

From these methods, QR code-based attendance stands out as a practical middle ground because it is less expensive than biometric systems and easier to deploy than infrastructure-heavy solutions.

## 2.7 Technologies for Web-Based Attendance Systems

The development of a web-based attendance system depends on several technologies, including frontend interfaces, backend processing, databases, QR code generation, and sometimes location or biometric tools.

Ikhsan and Helmina (2024) implemented their system using web technologies supported by QR code functions. Talip and Zulkifli (2019) also demonstrated that web and mobile integration improves attendance management.

Nguyen et al. (2022) extended this by integrating cloud support, QR code, facial recognition, and IoT components into a broader intelligent attendance architecture.

These studies show that the technology stack selected for an attendance system depends on the project goals. For a school-based class attendance management system, web technology combined with QR code and centralized database support provides a practical and cost-effective solution.

## 2.8 Security, Accuracy, and Reliability Considerations

Security, accuracy, and reliability are among the most important factors in attendance system design.

Badmus et al. (2021) argued that single-factor attendance systems create security weaknesses, which is why they proposed a hybrid fingerprint and RFID protocol. Their work shows that identity verification remains a core issue in attendance design.

Sunaryono et al. (2021) improved reliability by combining face recognition with QR code course data. Their method reduced the chance of marking attendance for the wrong course or by the wrong person.

Nguyen et al. (2022) pointed out that some smart attendance systems require high computing resources or specialized equipment, which can affect practicality and long-term deployment.

Ali et al. (2022) also concluded from their literature review that despite the success of many attendance systems, future research is still needed in the areas of security, technology selection, and implementation constraints.

These findings suggest that the best attendance system is not necessarily the most complex one, but the one that balances security, ease of use, affordability, and reliable data management.

## 2.9 Design Requirements and Information

To develop an effective web-based class attendance management system, some important requirements must be considered.

## 2.9.1 Functional Requirements

The system should be able to:

1. register and authenticate users;
2. assign user roles;
3. manage student records and course information;
4. create attendance sessions;
5. generate QR codes and session codes;
6. allow students to mark attendance;
7. store attendance history;
8. support attendance monitoring and reporting; and
9. provide administrative oversight.

These requirements are consistent with the trends identified by Ali et al. (2022), Iskandar et al. (2022), and Ikhsan and Helmina (2024), who all showed that attendance systems must go beyond simple marking and include structured record management.

## 2.9.2 Non-Functional Requirements

The system should also satisfy non-functional requirements such as:

1. security;
2. usability;
3. reliability;
4. maintainability;
5. scalability; and
6. performance.

Rahaman et al. (2025) and Nguyen et al. (2022) both demonstrate that real-time processing and centralized monitoring improve system usefulness, but these benefits are only meaningful when the system remains stable and easy to use.

## 2.9.3 Gaps in Existing Approaches and Basis for the Proposed System

The reviewed studies show that many attendance systems are effective, but most of them focus on a narrow aspect of attendance management. Some are based mainly on biometrics and require dedicated hardware. Others focus only on lecturer attendance, staff attendance, or specialized IoT settings. Some systems are efficient but do not fully integrate administrative control, student self-service, attendance history, and secure session-based attendance marking in one platform.

Based on these gaps, this project proposes the development of a web-based class attendance management system that combines the practicality of QR code attendance with the flexibility of a web platform. Unlike systems that depend heavily on biometric devices or complex infrastructure, the proposed system focuses on accessibility, role-based control, academic record integration, centralized attendance storage, and improved transparency for students, lecturers, and administrators.

## References Used in Chapters One and Two

- Ali, N. S., Alhilali, A. H., Rjeib, H. D., Alsharqi, H., and Al-Sadawi, B. (2022). *Automated attendance management systems: systematic literature review*.
- Talip, B. A., and Zulkifli, M. Z. (2019). *Mobile Attendance System Using QR Codes Technology*.
- Iskandar, A., Rahim, R., Matturungan, H., and Mansyur (2022). *Web-based STMIK AKBA Student Attendance Information System by Making QR Codes an Auxiliary Medium*.
- Ikhsan, M., and Helmina (2024). *Design of a Web-Based Lecturer Attendance Information System Using QR Codes at Muhammadiyah University of Jambi*.
- Badmus, E. O., Odekunle, O. P., and Oyewobi, D. O. (2021). *Smart Fingerprint Biometric and RFID Time-Based Attendance Management System*.
- Sunaryono, D., Siswantoro, J., and Anggoro, R. (2021). *An android based course attendance system using face recognition*.
- Nguyen, V. D., Khoa, H. V., Kieu, T. N., and Huh, E.-N. (2022). *Internet of Things-Based Intelligent Attendance System: Framework, Practice Implementation, and Application*.
- Rahaman, M., Islam, M. M., and Nandi, D. (2025). *SmartPresence: Wi-Fi-based online attendance management for smart academic assistance*.
