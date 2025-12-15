"use strict";

/* ================================
   スクロール表示アニメーション
================================ */
const cards = document.querySelectorAll(".card");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  {
    threshold: 0.15
  }
);

cards.forEach(card => observer.observe(card));

/* ================================
   ナビゲーション現在地ハイライト
================================ */
const navLinks = document.querySelectorAll("nav a");
const currentPath = location.pathname.split("/").pop();

navLinks.forEach(link => {
  const linkPath = link.getAttribute("href").split("/").pop();
  if (linkPath === currentPath) {
    link.classList.add("active");
  }
});
