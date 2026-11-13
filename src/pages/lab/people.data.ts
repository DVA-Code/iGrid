export interface Person {name:string;role:string;affiliation:string;image:string}
const person=(name:string,role:string,affiliation:string,image:string):Person=>({name,role,affiliation,image})
export const advisors:Person[]=[
 person('Dr. Samundra Gurung','Lab Lead','Assistant Professor, Kathmandu University','Samundra-Gurung.jpg'),
 person('Dr. Kamal Chapagain','Lab Advisor','Associate Professor, Kathmandu University','Kamal-Chapagain.jpeg'),
 person('Dr. Rajani Chulyadyo','Lab Advisor','Assistant Professor, Kathmandu University','Rajani -Chulyadyo .png'),
 person('Prof. Petr Korba','Lab Advisor','Zurich University of Applied Sciences, Switzerland','Petr-Korba.jpeg'),
 person('Prof. Dr. Francisco Jurado','Lab Advisor','University of Jaen, Spain','Francisco-Jurado.jpg'),
 person('Er. Ashish Shrestha','Industry Advisor','Mailung Khola Hydropower','Aashish-Shrestha.jpeg'),
 person('Dr. Sushil Aryal','Industry Advisor','Nepal Electricity Authority','Sushil-Aryal.webp'),
]
const ug='Undergraduate EEE, Kathmandu University'
export const teams:{id:string;name:string;period:string;members:Person[]}[]=[
 {id:'igrid',name:'IGrid project team',period:'May 2025 – April 2026',members:[
 person('Rohan Thapa','Research Assistant Intern','EEE IV-II, Kathmandu University','Rohan-Thapa.jpeg'),
 person('Saujan Prakash Niroula','Research Assistant Intern',ug,'Saujan-Niraula.jpeg'),
 person('Shirish Khadka','Research Assistant Intern',ug,'Shrish-Khadka.jpg'),
 person('Sakhchyam Sharma','Research Assistant Intern',ug,'Sakchyam-Sharma.jpg'),
 person('Ronnen Acharya','Research Assistant Intern',ug,'Ronen-Acharya.jpeg'),
 person('Shubham Bhandari','Research Assistant Intern',ug,'Shubham_Photo.jpg')]},
 {id:'net-zero',name:'Net-Zero project team',period:'August 2024 – July 2025',members:[person('Mr. Prasun Bajracharya','Member','Research Associate','Prasun-Bajracharya.jpg')]},
 {id:'reds',name:'REDS project team',period:'March 2024 – February 2025',members:[person('Ms. Anu Dhakal','RA Intern (Masters)','Masters Student','Anu-Dhakal.jpg'),person('Mr. Rupesh Neupane','RA Intern',ug,'Rupesh-Neupane.jpg'),person('Mr. Rohan Thapa','RA Intern',ug,'Rohan-Thapa.jpeg')]},
 {id:'dva',name:'D-VA Grid project team',period:'February 2023 – December 2024',members:[
 person('Mr. Bibek Mallik','Researcher','Project Member','Bibek-Mallik.jpg'),person('Dr. Basanta Raj Pokhrel','Researcher','Project Member','Basanta-Pokhrel.jpeg'),person('Mr. Phurba Tshering Sherpa','Research Assistant','Member','Phurba-Sherpa.jpg'),person('Mr. Nabindra Raj Shrestha','Research Assistant','Member','Nabindra-Shrestha.png'),person('Mr. Pratyush Poudel','Member','Past Member','Pratyush-Poudel.jpg'),person('Ms. Ayushma Bhandari','RA Intern',ug,'Ayushma-Bhandari.jpg'),person('Mr. Anil Poudel','RA Intern',ug,'Anil-Poudel.jpg'),person('Mr. Abhinash Jha','Research Assistant','EEE, Kathmandu University','Abhinash-Jha.jpg')]}
]
