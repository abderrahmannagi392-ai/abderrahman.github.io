<!DOCTYPE html>
<html lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>منصة طلاب جامعة لعيون</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
body{margin:0;font-family:Tahoma,Arial;direction:rtl;background:#f5f7f6;display:flex;flex-direction:column;min-height:100vh;overflow-x:hidden;transition:0.3s;}
header{background:#1f7a3f;display:flex;justify-content:center;align-items:center;flex-direction:column;padding:10px;position:relative;z-index:2;transition:0.3s;}
.logo{display:flex;align-items:center;background:linear-gradient(90deg,#2ca54c,#1f7a3f);border-radius:10px;width:90%;max-width:900px;height:120px;padding:10px 20px;color:white;box-shadow:0 4px 10px rgba(0,0,0,0.2);transition:0.3s;}
.logo i{font-size:60px;margin-left:20px;}
.logo-text span:first-child{font-size:28px;font-weight:bold;display:block;}
.logo-text span:last-child{font-size:20px;}
.search-bar{margin-top:10px;width:60%;max-width:500px;display:flex;align-items:center;border-radius:25px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.2);background:white;transition:0.3s;}
.search-bar input{flex:1;padding:10px 15px;border:none;outline:none;font-size:16px;background:white;color:#333;transition:0.3s;border-radius:0;}
.search-bar button{background:#1f7a3f;border:none;color:white;padding:10px 15px;cursor:pointer;font-size:18px;transition:0.3s;}
.search-bar button:hover{background:#2ca54c;}
.ads-slider{width:90%;max-width:900px;height:220px;margin:10px auto;position:relative;border-radius:10px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.2);z-index:2;transition:0.3s;}
.ads-slider img{width:100%;height:100%;object-fit:cover;display:block;}
.ad-text{position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.5);color:white;padding:6px 12px;border-radius:5px;font-size:18px;font-weight:bold;}
.news{background:#e8f5e9;color:#1f7a3f;padding:10px;font-weight:bold;margin-top:10px;text-align:center;overflow:hidden;position:relative;transition:0.3s;}
.news-content{display:inline-block;padding-left:100%;white-space:nowrap;animation:scrollNews 15s linear infinite;}
@keyframes scrollNews{0%{transform:translateX(0);}100%{transform:translateX(-100%);}}
main{flex:1;}
.menu{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;width:90%;margin:auto;padding:30px 0;}
.box{background:white;padding:25px;text-align:center;border-radius:10px;box-shadow:0 3px 10px rgba(0,0,0,0.1);transition:0.3s;text-decoration:none;color:#333;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;}
.box:hover{transform:translateY(-5px);}
.box i{font-size:38px;color:#1f7a3f;margin-bottom:10px;display:block;transition:0.3s;}
footer{background:#1f7a3f;color:white;text-align:center;padding:15px;transition:0.3s;}
@media (max-width:600px){.menu{grid-template-columns:repeat(2,1fr);}.logo{height:80px;}.logo i{font-size:45px;}.logo-text span:first-child{font-size:22px;}.logo-text span:last-child{font-size:16px;}.ads-slider{height:150px;}.ad-text{font-size:14px;padding:4px 8px;}.search-bar{width:80%;}}

/* Sidebar */
.sidebar{position:fixed;top:0;left:-260px;width:260px;height:100%;background:#1f7a3f;padding-top:70px;display:flex;flex-direction:column;z-index:10003;transition:left 0.3s ease,background 0.3s;}
.sidebar a{padding:15px 20px;text-decoration:none;font-size:18px;color:white;display:flex;align-items:center;border-radius:6px;margin:5px 10px;transition:0.3s;cursor:pointer; z-index:10003;}
.sidebar a i{margin-left:10px;margin-right:8px;font-size:20px;}
.sidebar a:hover{background:#2ca54c;}
#sidebarToggle{position:fixed;top:15px;left:15px;font-size:28px;background:#1f7a3f;color:white;border:none;border-radius:6px;padding:8px 10px;cursor:pointer;z-index:10004;box-shadow:0 2px 8px rgba(0,0,0,0.3);}
#sidebarToggle:hover{background:#2ca54c;}
.overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);opacity:0;visibility:hidden;transition:opacity 0.3s;z-index:10002;}
.overlay.active{opacity:1;visibility:visible;}
.language-list, .contact-list, .about-list{display:none;flex-direction:column;background:#2ca54c;margin:5px 10px;border-radius:6px;max-height:250px;overflow-y:auto;scroll-behavior:smooth;padding-bottom:10px;transition:0.3s;}
.language-list a, .contact-list a{color:white;padding:10px;font-size:16px;display:flex;align-items:center;gap:8px;transition:0.3s;white-space:nowrap;}
.language-list a:hover, .contact-list a:hover{background:#1f7a3f;}
.language-list img{width:24px;height:16px;object-fit:cover;border-radius:2px;}
.contact-list a i{margin-right:5px;font-size:20px;}
.about-list p{color:white;font-size:16px;line-height:1.5;text-align:center;margin:10px;overflow-y:auto;max-height:200px;scroll-behavior:smooth;transition:0.3s;}
.language-nav{display:flex;align-items:center;gap:5px;margin:10px 10px;color:white;font-weight:bold;font-size:16px;z-index:10003;}
.language-nav img{width:22px;height:16px;border-radius:2px;}
.language-nav span{margin-left:5px;}
.language-nav button{background:#1f7a3f;border:none;color:white;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:24px;display:flex;align-items:center;justify-content:center;transition:0.3s;}
.language-nav button:hover{background:#2ca54c;}

/* Night mode */
body.night, body.night header, body.night .logo, body.night .menu .box, body.night .ads-slider, body.night .news, body.night footer, body.night .sidebar{background:#000 !important;color:white !important;}
body.night .menu .box i, body.night .logo i, body.night #sidebarToggle i{color:white;}
body.night .search-bar{background:#111;}
body.night .search-bar input{background:#222;color:white;border:1px solid #555;}
body.night .search-bar button{background:#111;border:1px solid #555;color:white;}

/* Modals */
.modal{display:none; position:fixed; z-index:20005; left:0; top:0; width:100%; height:100%; overflow:auto; background:rgba(0,0,0,0.5);}
.modal-content{background:#fff; margin:10% auto; padding:20px 30px; border-radius:15px; width:90%; max-width:400px; position:relative; text-align:center; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; box-shadow:0 8px 20px rgba(0,0,0,0.3);}
.modal-content h3{margin-top:0; font-size:24px; color:#1f7a3f;}
.modal-content p, .modal-content a{font-size:16px; line-height:1.6; color:#333; margin:15px 0; display:block;}
.modal-content a{text-decoration:none; background:#1f7a3f; color:white; padding:8px 12px; border-radius:6px;}
.modal-close{margin-top:20px; padding:10px 25px; background:#1f7a3f; color:white; border:none; border-radius:8px; cursor:pointer; font-size:16px; transition:0.3s;}
.modal-close:hover{background:#2ca54c;}
body.night .modal-content{background:#111;color:white;}
body.night .modal-content h3{color:white;}
body.night .modal-content p, body.night .modal-content a{color:white;}
body.night .modal-close{background:#222;color:white;}
body.night .modal-close:hover{background:#555;}
body.night .modal-content a{background:#222;color:white;}
</style>
<body>

<header>
<div class="logo">
<i class="fa-solid fa-graduation-cap"></i>
<div class="logo-text">
<span id="logo-main">منصة طلاب</span>
<span id="logo-sub">جامعة لعيون</span>
</div>
</div>
<div class="search-bar">
<input type="text" id="searchInput" placeholder="ابحث هنا...">
<button id="searchBtn"><i class="fa-solid fa-magnifying-glass"></i></button>
</div>
</header>

<div class="ads-slider">
<img id="adImage" src="https://picsum.photos/900/300?1">
<div class="ad-text" id="adText">إعلان: تسجيل الفصل الدراسي الجديد</div>
</div>

<div class="news" id="newsBar">
<div class="news-content" id="newsContent">مرحبا بكم في منصة طلاب جامعة لعيون - آخر الأخبار والإعلانات ستظهر هنا</div>
</div>

<main>
<div class="menu">
<a href="#" class="box" data-key="home"><i class="fa-solid fa-house"></i><span>الرئيسية</span></a>
<a href="#" class="box" data-key="students" id="studentRegisterBtn"><i class="fa-solid fa-user-graduate"></i><span>الطلاب</span></a>
<a href="#" class="box" data-key="courses"><i class="fa-solid fa-book"></i><span>المقررات</span></a>
<a href="#" class="box" data-key="news"><i class="fa-solid fa-newspaper"></i><span>الأخبار</span></a>
<a href="#" class="box" data-key="announcements"><i class="fa-solid fa-bullhorn"></i><span>الإعلانات</span></a>
<a href="#" class="box" id="contactToggleMain"><i class="fa-solid fa-envelope"></i><span data-key="contact">اتصل بنا</span></a>
</div>
</main>

<footer id="footer">© جميع الحقوق محفوظة - منصة طلاب جامعة لعيون</footer>

<button id="sidebarToggle"><i class="fa-solid fa-bars"></i></button>

<!-- Sidebar -->
<div id="mySidebar" class="sidebar">
<a href="#" data-key="home"><i class="fa-solid fa-house"></i><span>الرئيسية</span></a>
<a href="#" data-key="students"><i class="fa-solid fa-user-graduate"></i><span>الطلاب</span></a>
<a href="#" data-key="courses"><i class="fa-solid fa-book"></i><span>المقررات</span></a>
<a href="#" data-key="news"><i class="fa-solid fa-newspaper"></i><span>الأخبار</span></a>
<a href="#" data-key="announcements"><i class="fa-solid fa-bullhorn"></i><span>الإعلانات</span></a>
<a href="#" id="contactToggle" data-key="contact"><i class="fa-solid fa-envelope"></i><span>اتصل بنا</span></a>
<a href="#" id="aboutToggle" data-key="about"><i class="fa-solid fa-user-circle"></i><span>من نحن</span></a>

<div class="language-nav">
<span id="currentLang"><img src="https://flagcdn.com/sa.svg" alt=""> العربية</span>
<button id="prevLang"><i class="fa-solid fa-arrow-up"></i></button>
<button id="nextLang"><i class="fa-solid fa-arrow-down"></i></button>
</div>

<div class="language-list" id="languageList">
<a href="#" data-lang="ar" class="active"><img src="https://flagcdn.com/sa.svg" alt=""> العربية</a>
<a href="#" data-lang="en"><img src="https://flagcdn.com/us.svg" alt=""> English</a>
<a href="#" data-lang="fr"><img src="https://flagcdn.com/fr.svg" alt=""> Français</a>
</div>

<a href="#" id="nightToggle"><i class="fa-solid fa-moon"></i> الوضع الليلي</a>

<div id="overlay" class="overlay"></div>

<!-- Modals -->
<div class="modal" id="contactModal">
<div class="modal-content">
<h3>اتصل بنا</h3>
<p>يمكنك التواصل معنا عبر:</p>
<a href="tel:+22247526504">+222 47526504</a>
<a href="mailto:abdarrahmannagi@gmail.com">abdarrahmannagi@gmail.com</a>
<button class="modal-close">إغلاق</button>
</div>
</div>

<div class="modal" id="aboutModal">
<div class="modal-content">
<h3>من نحن</h3>
<p>أنا عبد الرحمن ولد الناجي، طالب في جامعة العلوم الإسلامية بلعيون، تخصص القانون الخاص. منذ صغري وأنا شغوف بالبرمجة وتطوير المواقع، وقد أنشأت هذه المنصة لتسهيل التواصل والمعلومات للطلاب.</p>
<button class="modal-close">إغلاق</button>
</div>
</div>

<div class="modal" id="studentRegisterModal">
<div class="modal-content">
<h3>تسجيل طالب جديد</h3>
<input type="email" id="studentEmail" placeholder="البريد الإلكتروني" style="width:80%;margin:8px 0;padding:8px;">
<input type="text" id="studentName" placeholder="الاسم" style="width:80%;margin:8px 0;padding:8px;">
<input type="text" id="studentFather" placeholder="اسم الأب" style="width:80%;margin:8px 0;padding:8px;">
<input type="tel" id="studentPhone" placeholder="رقم الهاتف" style="width:80%;margin:8px 0;padding:8px;">
<input type="password" id="studentPass" placeholder="كلمة السر" style="width:80%;margin:8px 0;padding:8px;">
<button class="modal-close">إغلاق</button>
<a href="#" id="registerStudentBtn">إنشاء الحساب</a>
</div>
</div>

<script>
// Sidebar
const sidebar=document.getElementById("mySidebar");
const toggleBtn=document.getElementById("sidebarToggle");
const overlay=document.getElementById("overlay");
let sidebarOpen=false;
toggleBtn.addEventListener("click",()=>{sidebarOpen?closeSidebar():openSidebar();});
overlay.addEventListener("click",()=>{closeSidebar(); closeModals();});
function openSidebar(){sidebar.style.left="0";overlay.classList.add("active");sidebarOpen=true;}
function closeSidebar(){sidebar.style.left="-260px";overlay.classList.remove("active");sidebarOpen=false;}

// Modals
const contactModal=document.getElementById("contactModal");
const aboutModal=document.getElementById("aboutModal");
const studentModal=document.getElementById("studentRegisterModal");
function closeModals(){contactModal.style.display='none'; aboutModal.style.display='none'; studentModal.style.display='none';}
document.querySelectorAll('.modal-close').forEach(btn=>{btn.addEventListener('click',closeModals);});

// Contact/About
document.getElementById('contactToggle').addEventListener('click',e=>{e.preventDefault();contactModal.style.display='block';aboutModal.style.display='none'; studentModal.style.display='none';});
document.getElementById('contactToggleMain').addEventListener('click',e=>{e.preventDefault();contactModal.style.display='block';aboutModal.style.display='none'; studentModal.style.display='none';});
document.getElementById('aboutToggle').addEventListener('click',e=>{e.preventDefault();aboutModal.style.display='block';contactModal.style.display='none'; studentModal.style.display='none';});

// Student register
document.getElementById('studentRegisterBtn').addEventListener('click',e=>{e.preventDefault();studentModal.style.display='block';contactModal.style.display='none'; aboutModal.style.display='none';});

// Ads slider
let ads=["https://picsum.photos/900/300?1","https://picsum.photos/900/300?2","https://picsum.photos/900/300?3"];
let texts=["إعلان: تسجيل الفصل الدراسي الجديد","إعلان: جدول الامتحانات متوفر الآن","إعلان: ندوة علمية يوم الخميس"];
let i=0;
setInterval(()=>{i++;if(i>=ads.length)i=0;document.querySelector(".ads-slider img").src=ads[i];document.querySelector(".ad-text").textContent=texts[i];},4000);

// Language
const langLinks=document.querySelectorAll('#languageList a');
let currentLangIndex=0;
const translations={
ar:{logoMain:"منصة طلاب",logoSub:"جامعة لعيون",home:"الرئيسية",students:"الطلاب",courses:"المقررات",news:"الأخبار",announcements:"الإعلانات",contact:"اتصل بنا",about:"من نحن",newsBar:"مرحبا بكم في منصة طلاب جامعة لعيون - آخر الأخبار والإعلانات ستظهر هنا",footer:"© جميع الحقوق محفوظة - منصة طلاب جامعة لعيون",search:"ابحث هنا...",nightMode:"الوضع الليلي"},
en:{logoMain:"Students Platform",logoSub:"University of Laayoune",home:"Home",students:"Students",courses:"Courses",news:"News",announcements:"Announcements",contact:"Contact",about:"About Us",newsBar:"Welcome to Students Platform - Latest news and announcements will appear here",footer:"© All rights reserved - Students Platform University of Laayoune",search:"Search here...",nightMode:"Night Mode"},
fr:{logoMain:"Plateforme Étudiants",logoSub:"Université de Laayoune",home:"Accueil",students:"Étudiants",courses:"Cours",news:"Actualités",announcements:"Annonces",contact:"Contactez-nous",about:"À propos",newsBar:"Bienvenue sur la plateforme étudiante - Les dernières nouvelles et annonces apparaîtront ici",footer:"© Tous droits réservés - Plateforme Étudiants Université de Laayoune",search:"Recherche...",nightMode:"Mode Nuit"}
};
function updateLanguage(index){
  currentLangIndex=index;
  langLinks.forEach(a=>a.classList.remove('active'));
  langLinks[index].classList.add('active');
  const langCode=langLinks[index].dataset.lang;
  document.getElementById('currentLang').innerHTML=`<img src="${langLinks[index].querySelector('img').src}" alt=""> ${langLinks[index].textContent}`;
  if(translations[langCode]){
    const t=translations[langCode];
    document.getElementById("logo-main").textContent=t.logoMain;
    document.getElementById("logo-sub").textContent=t.logoSub;
    document.querySelectorAll('.menu .box span').forEach((span,i)=>{
      switch(i){case 0: span.textContent=t.home; break; case 1: span.textContent=t.students; break; case 2: span.textContent=t.courses; break; case 3: span.textContent=t.news; break; case 4: span.textContent=t.announcements; break; case 5: span.textContent=t.contact; break;}
    });
    document.querySelectorAll('#mySidebar a span').forEach(a=>{const key=a.parentNode.dataset.key;if(t[key]) a.textContent=t[key];});
    document.getElementById("newsContent").textContent=t.newsBar;
    document.getElementById("footer").textContent=t.footer;
    document.getElementById("searchInput").placeholder=t.search;
    document.getElementById('nightToggle').innerHTML=`<i class="fa-solid fa-moon"></i> ${t.nightMode}`;
  }
}
document.getElementById('prevLang').addEventListener('click',()=>{updateLanguage((currentLangIndex-1+langLinks.length)%langLinks.length);});
document.getElementById('nextLang').addEventListener('click',()=>{updateLanguage((currentLangIndex+1)%langLinks.length);});
langLinks.forEach((link,i)=>{link.addEventListener('click',e=>{e.preventDefault();updateLanguage(i);});});
updateLanguage(0);

// Night mode toggle
document.getElementById('nightToggle').addEventListener('click',e=>{e.preventDefault();document.body.classList.toggle('night');});

// Search (demo)
document.getElementById('searchBtn').addEventListener('click',()=>{alert(document.getElementById("searchInput").value);});

// Student register button (demo)
document.getElementById('registerStudentBtn').addEventListener('click',()=>{
  alert("تم إنشاء حساب الطالب بنجاح!");
  closeModals();
});
</script>

</body>
</html>
