const API = "http://localhost:5000";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let students = [];
let courses = [];
let grades = [];

// ---------- navigation ----------
function showView(name) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  $("#view-" + name).classList.remove("hidden");
  $$(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "students") renderStudents();
  if (name === "courses") renderCourses();
  if (name === "grades") { loadGrades(); populateFilters(); }
  if (name === "dashboard") loadDashboard();
  if (name === "report") populateReportStudents();
}
$$(".navbtn").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

// ---------- modal ----------
function openModal(html) {
  $("#modal").innerHTML = html;
  $("#modal").classList.remove("hidden");
  $("#modal-backdrop").classList.remove("hidden");
}
function closeModal() {
  $("#modal").classList.add("hidden");
  $("#modal-backdrop").classList.add("hidden");
}

// ---------- API helpers ----------
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

// ---------- data loading ----------
async function loadStudents() {
  students = await api("/api/students");
  return students;
}
async function loadCourses() {
  courses = await api("/api/courses");
  return courses;
}
async function loadGrades() {
  const sid = $("#filter-student")?.value;
  const cid = $("#filter-course")?.value;
  let url = "/api/grades";
  const params = [];
  if (sid) params.push("student_id=" + sid);
  if (cid) params.push("course_id=" + cid);
  if (params.length) url += "?" + params.join("&");
  grades = await api(url);
  renderGrades();
}

async function populateFilters() {
  const ss = $("#filter-student");
  const cs = $("#filter-course");
  const curS = ss.value, curC = cs.value;
  ss.innerHTML = '<option value="">All students</option>' +
    students.map(s => `<option value="${s.id}">${s.first_name} ${s.last_name}</option>`).join("");
  cs.innerHTML = '<option value="">All courses</option>' +
    courses.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  ss.value = curS; cs.value = curC;
  ss.onchange = loadGrades; cs.onchange = loadGrades;
}

// ---------- Dashboard ----------
async function loadDashboard() {
  try {
    const st = await api("/api/stats");
    $("#st-students").textContent = st.students;
    $("#st-courses").textContent = st.courses;
    $("#st-grades").textContent = st.grades;
    await loadStudents(); await loadCourses();
    const rows = [];
    for (const s of students) {
      try {
        const r = await api("/api/report/student/" + s.id);
        rows.push({ name: s.first_name + " " + s.last_name, avg: r.overall_average, letter: r.overall_letter });
      } catch (e) {}
    }
    rows.sort((a,b) => b.avg - a.avg);
    const top = rows.slice(0,5);
    const tbody = $("#top-table tbody");
    tbody.innerHTML = top.length ? top.map(r =>
      `<tr><td>${r.name}</td><td>${r.avg}</td><td><span class="letter ${r.letter}">${r.letter}</span></td></tr>`).join("") :
      '<tr><td colspan="3" class="empty">No data yet</td></tr>';
  } catch (e) { setStatus("Backend unavailable: " + e.message, true); }
}

// ---------- Students ----------
function renderStudents() {
  const q = $("#student-search").value.toLowerCase();
  const list = students.filter(s =>
    (s.first_name + " " + s.last_name + " " + s.student_code + " " + (s.email||"")).toLowerCase().includes(q));
  const tbody = $("#students-table tbody");
  tbody.innerHTML = list.length ? list.map(s => `
    <tr>
      <td>${s.student_code}</td>
      <td>${s.first_name} ${s.last_name}</td>
      <td>${s.email || ""}</td>
      <td>${s.class_name || ""}</td>
      <td>
        <button onclick="editStudent(${s.id})">Edit</button>
        <button class="danger" onclick="deleteStudent(${s.id})">Delete</button>
      </td>
    </tr>`).join("") : '<tr><td colspan="5" class="empty">No students</td></tr>';
}

$("#student-search").addEventListener("input", renderStudents);

function openStudentModal(s = null) {
  openModal(`
    <h2>${s ? "Edit" : "Add"} Student</h2>
    <div class="row"><label>Student Code</label><input id="m-code" value="${s?.student_code || ""}" /></div>
    <div class="row"><label>First Name</label><input id="m-first" value="${s?.first_name || ""}" /></div>
    <div class="row"><label>Last Name</label><input id="m-last" value="${s?.last_name || ""}" /></div>
    <div class="row"><label>Email</label><input id="m-email" value="${s?.email || ""}" /></div>
    <div class="row"><label>Class</label><input id="m-class" value="${s?.class_name || ""}" /></div>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancel</button>
      <button onclick="saveStudent(${s?.id || 'null'})">Save</button>
    </div>`);
}

function editStudent(id) { openStudentModal(students.find(s => s.id === id)); }

async function saveStudent(id) {
  const body = {
    student_code: $("#m-code").value.trim(),
    first_name: $("#m-first").value.trim(),
    last_name: $("#m-last").value.trim(),
    email: $("#m-email").value.trim(),
    class_name: $("#m-class").value.trim(),
  };
  try {
    if (id) await api("/api/students/" + id, { method: "PUT", body });
    else await api("/api/students", { method: "POST", body });
    closeModal();
    await loadStudents();
    renderStudents();
    setStatus("Saved");
  } catch (e) { alert(e.message); }
}

async function deleteStudent(id) {
  if (!confirm("Delete this student and their grades?")) return;
  try {
    await api("/api/students/" + id, { method: "DELETE" });
    await loadStudents();
    renderStudents();
    setStatus("Deleted");
  } catch (e) { alert(e.message); }
}

// ---------- Courses ----------
function renderCourses() {
  const tbody = $("#courses-table tbody");
  tbody.innerHTML = courses.length ? courses.map(c => `
    <tr>
      <td>${c.code}</td>
      <td>${c.name}</td>
      <td>${c.credits}</td>
      <td><button class="danger" onclick="deleteCourse(${c.id})">Delete</button></td>
    </tr>`).join("") : '<tr><td colspan="4" class="empty">No courses</td></tr>';
}

function openCourseModal() {
  openModal(`
    <h2>Add Course</h2>
    <div class="row"><label>Code</label><input id="c-code" /></div>
    <div class="row"><label>Name</label><input id="c-name" /></div>
    <div class="row"><label>Credits</label><input id="c-credits" type="number" value="3" step="0.5" /></div>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancel</button>
      <button onclick="saveCourse()">Save</button>
    </div>`);
}

async function saveCourse() {
  const body = {
    code: $("#c-code").value.trim(),
    name: $("#c-name").value.trim(),
    credits: parseFloat($("#c-credits").value) || 1,
  };
  try {
    await api("/api/courses", { method: "POST", body });
    closeModal();
    await loadCourses();
    renderCourses();
    setStatus("Saved");
  } catch (e) { alert(e.message); }
}

async function deleteCourse(id) {
  if (!confirm("Delete this course and its grades?")) return;
  try {
    await api("/api/courses/" + id, { method: "DELETE" });
    await loadCourses();
    renderCourses();
    setStatus("Deleted");
  } catch (e) { alert(e.message); }
}

// ---------- Grades ----------
function renderGrades() {
  const tbody = $("#grades-table tbody");
  tbody.innerHTML = grades.length ? grades.map(g => `
    <tr>
      <td>${g.first_name} ${g.last_name}</td>
      <td>${g.course_name}</td>
      <td>${g.assessment}</td>
      <td>${g.score} / ${g.max_score}</td>
      <td>${g.weight}</td>
      <td>${g.taken_on || ""}</td>
      <td><button class="danger" onclick="deleteGrade(${g.id})">Delete</button></td>
    </tr>`).join("") : '<tr><td colspan="7" class="empty">No grades</td></tr>';
}

function openGradeModal() {
  const stuOpts = students.map(s => `<option value="${s.id}">${s.first_name} ${s.last_name}</option>`).join("");
  const courOpts = courses.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  openModal(`
    <h2>Add Grade</h2>
    <div class="row"><label>Student</label><select id="g-student">${stuOpts}</select></div>
    <div class="row"><label>Course</label><select id="g-course">${courOpts}</select></div>
    <div class="row"><label>Assessment</label><input id="g-assess" placeholder="e.g. Midterm" /></div>
    <div class="row"><label>Score</label><input id="g-score" type="number" step="0.1" /></div>
    <div class="row"><label>Max Score</label><input id="g-max" type="number" value="100" step="0.1" /></div>
    <div class="row"><label>Weight</label><input id="g-weight" type="number" value="1" step="0.1" /></div>
    <div class="row"><label>Date</label><input id="g-date" type="date" /></div>
    <div class="modal-actions">
      <button onclick="closeModal()">Cancel</button>
      <button onclick="saveGrade()">Save</button>
    </div>`);
}

async function saveGrade() {
  const body = {
    student_id: parseInt($("#g-student").value),
    course_id: parseInt($("#g-course").value),
    assessment: $("#g-assess").value.trim(),
    score: parseFloat($("#g-score").value),
    max_score: parseFloat($("#g-max").value),
    weight: parseFloat($("#g-weight").value),
    taken_on: $("#g-date").value || null,
  };
  try {
    await api("/api/grades", { method: "POST", body });
    closeModal();
    await loadGrades();
    setStatus("Saved");
  } catch (e) { alert(e.message); }
}

async function deleteGrade(id) {
  if (!confirm("Delete this grade?")) return;
  try {
    await api("/api/grades/" + id, { method: "DELETE" });
    await loadGrades();
    setStatus("Deleted");
  } catch (e) { alert(e.message); }
}

// ---------- Report ----------
function populateReportStudents() {
  const sel = $("#report-student");
  sel.innerHTML = '<option value="">Select student</option>' +
    students.map(s => `<option value="${s.id}">${s.first_name} ${s.last_name} (${s.student_code})</option>`).join("");
}

async function loadReport() {
  const id = $("#report-student").value;
  if (!id) return;
  const data = await api("/api/report/student/" + id);
  let html = `
    <div class="course-card">
      <h3>${data.student.first_name} ${data.student.last_name} <small>(${data.student.student_code})</small></h3>
      <div>Overall Average: <strong>${data.overall_average}</strong> &nbsp; <span class="letter ${data.overall_letter}">${data.overall_letter}</span> &nbsp; GPA: <strong>${data.overall_gpa}</strong></div>
    </div>`;
  for (const c of data.courses) {
    html += `<div class="course-card">
      <h3>${c.course_name} <small>${c.course_code}</small></h3>
      <div>Average: <strong>${c.average}</strong> <span class="letter ${c.letter}">${c.letter}</span> · GPA ${c.gpa_points}</div>
      <table><thead><tr><th>Assessment</th><th>Score</th><th>%</th><th>Weight</th><th>Date</th></tr></thead><tbody>
      ${c.items.map(i => `<tr><td>${i.assessment}</td><td>${i.score}/${i.max_score}</td><td>${i.percent}%</td><td>${i.weight}</td><td>${i.taken_on || ""}</td></tr>`).join("")}
      </tbody></table>
    </div>`;
  }
  if (!data.courses.length) html += '<p class="empty">No grades yet.</p>';
  $("#report-area").innerHTML = html;
}

// ---------- status ----------
function setStatus(msg, err = false) {
  const el = $("#status");
  el.textContent = msg;
  el.style.color = err ? "#f87171" : "#94a3b8";
  if (!err) setTimeout(() => { el.textContent = "Connected"; }, 2000);
}

// ---------- init ----------
(async function init() {
  try {
    await api("/api/health");
    await loadStudents();
    await loadCourses();
    setStatus("Connected");
  } catch (e) {
    setStatus("Backend unavailable — start backend server", true);
  }
  showView("dashboard");
})();
