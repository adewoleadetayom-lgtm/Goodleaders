const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "server.js");
const chatPath = path.join(__dirname, "views", "chat.ejs");

let server = fs.readFileSync(serverPath, "utf8");
let chat = fs.readFileSync(chatPath, "utf8");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");

fs.copyFileSync(serverPath, `${serverPath}.backup-private-repair-${stamp}`);
fs.copyFileSync(chatPath, `${chatPath}.backup-private-repair-${stamp}`);

console.log("");
console.log("==============================================");
console.log("   GOODLEADERS PRIVATE FILE REPAIR");
console.log("==============================================");
console.log("");

// --------------------------------------------------
// 1. Ensure upload folder exists
// --------------------------------------------------

const uploadDir = path.join(
    __dirname,
    "public",
    "private-uploads"
);

fs.mkdirSync(uploadDir, { recursive: true });

console.log("✅ Private upload folder ready.");

// --------------------------------------------------
// 2. Ensure multer private upload exists
// --------------------------------------------------

if (!server.includes("const privateUpload = multer")) {
    throw new Error(
        "privateUpload middleware is missing from server.js"
    );
}

console.log("✅ Private upload middleware found.");

// --------------------------------------------------
// 3. Ensure private database table exists
// --------------------------------------------------

if (!server.includes("CREATE TABLE IF NOT EXISTS private_files")) {
    throw new Error(
        "private_files table setup is missing."
    );
}

console.log("✅ private_files database table setup found.");

// --------------------------------------------------
// 4. Ensure private upload route exists
// --------------------------------------------------

if (!server.includes('"/chat/private-upload"')) {
    throw new Error(
        "Private upload route is missing."
    );
}

console.log("✅ Private upload route found.");

// --------------------------------------------------
// 5. Ensure private file query exists
// --------------------------------------------------

if (!server.includes("FROM private_files")) {
    throw new Error(
        "Private file database query is missing."
    );
}

console.log("✅ Private file query found.");

// --------------------------------------------------
// 6. Replace private file query with robust matching
// --------------------------------------------------

const queryRegex =
/privateFiles = await pool\\.query\\([\\s\\S]*?FROM private_files[\\s\\S]*?ORDER BY id ASC[\\s\\S]*?\\);/;

const newQuery = `privateFiles = await pool.query(
                \`
                SELECT *
                FROM private_files
                WHERE
                    (
                        LOWER(TRIM(sender)) = LOWER(TRIM($1))
                        AND
                        LOWER(TRIM(receiver)) = LOWER(TRIM($2))
                    )
                    OR
                    (
                        LOWER(TRIM(sender)) = LOWER(TRIM($2))
                        AND
                        LOWER(TRIM(receiver)) = LOWER(TRIM($1))
                    )
                ORDER BY id ASC
                \`,
                [req.session.user, selectedUser]
            );`;

if (queryRegex.test(server)) {
    server = server.replace(queryRegex, newQuery);
    console.log("✅ Private file query repaired.");
} else {
    console.log("⚠️ Private file query already has a different structure.");
}

// --------------------------------------------------
// 7. Make sure privateFiles is passed to EJS
// --------------------------------------------------

if (!server.includes("privateFiles: privateFiles.rows")) {
    const renderMarker = "messages: messages.rows,";

    if (!server.includes(renderMarker)) {
        throw new Error(
            "Could not locate chat render variables."
        );
    }

    server = server.replace(
        renderMarker,
        `${renderMarker}
            privateFiles: privateFiles.rows,`
    );

    console.log("✅ privateFiles added to chat render.");
} else {
    console.log("✅ privateFiles already passed to chat.");
}

// --------------------------------------------------
// 8. Ensure private static route exists
// --------------------------------------------------

if (!server.includes('"/private-uploads"')) {

    const marker = "// =========================\n// HELPERS";

    if (server.includes(marker)) {

        const addition = `// =========================
// PRIVATE UPLOAD FILE ACCESS
// =========================

app.use(
    "/private-uploads",
    express.static(
        path.join(__dirname, "public", "private-uploads")
    )
);

${marker}`;

        server = server.replace(marker, addition);

        console.log("✅ Private static file route added.");

    } else {
        console.log(
            "⚠️ Could not automatically locate HELPERS marker."
        );
    }

} else {
    console.log("✅ Private static file route found.");
}

// --------------------------------------------------
// 9. Ensure private file display exists
// --------------------------------------------------

const displayMarker =
    '<a\n                    href="/private-uploads/';

if (!chat.includes(displayMarker)) {

    const privateMarker =
        '<% } else if (selectedUser) { %>';

    const position = chat.indexOf(privateMarker);

    if (position === -1) {
        throw new Error(
            "Could not locate private chat section."
        );
    }

    const display = `

<%
const safePrivateFiles =
    typeof privateFiles !== "undefined"
        ? privateFiles
        : [];
%>

<% safePrivateFiles.forEach(file => { %>

<div class="message-row <%= file.sender === user ? 'you' : 'other' %>">

    <div class="message">

        <div class="message-name">
            <%= file.sender === user ? "You" : file.sender %>
        </div>

        <div class="message-text">

            📎 <strong><%= file.original_name %></strong>

            <br>

            <small>
                <%= (Number(file.file_size) / 1024 / 1024).toFixed(2) %> MB
            </small>

            <br>

            <a
                href="/private-uploads/<%= encodeURIComponent(file.stored_name) %>"
                target="_blank"
                rel="noopener noreferrer"
                style="color:inherit;font-weight:bold;"
            >
                📥 Open / Download
            </a>

        </div>

        <div class="message-time">
            <%= file.date %>
        </div>

    </div>

</div>

<% }) %>

`;

    chat =
        chat.substring(0, position) +
        display +
        chat.substring(position);

    console.log("✅ Private file display added.");

} else {

    console.log("✅ Private file display found.");
}

// --------------------------------------------------
// 10. Ensure private upload form exists
// --------------------------------------------------

if (!chat.includes('action="/chat/private-upload"')) {

    const privateMarker =
        '<% } else if (selectedUser) { %>';

    const position = chat.indexOf(privateMarker);

    if (position === -1) {
        throw new Error(
            "Could not locate private chat section."
        );
    }

    const form = `

<form
    action="/chat/private-upload"
    method="POST"
    enctype="multipart/form-data"
    class="input-area"
    style="border-top:none;"
>

    <input
        type="hidden"
        name="receiver"
        value="<%= selectedUser %>"
    >

    <input
        type="file"
        name="privateFile"
        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        required
    >

    <button type="submit">
        📎 Send File
    </button>

</form>

`;

    chat =
        chat.substring(0, position) +
        form +
        chat.substring(position);

    console.log("✅ Private upload form added.");

} else {

    console.log("✅ Private upload form found.");
}

// --------------------------------------------------
// 11. Protect uploads in git
// --------------------------------------------------

const gitignorePath =
    path.join(__dirname, ".gitignore");

let gitignore =
    fs.existsSync(gitignorePath)
        ? fs.readFileSync(gitignorePath, "utf8")
        : "";

if (!gitignore.includes("public/private-uploads/")) {

    gitignore +=
        (gitignore.endsWith("\n") || gitignore.length === 0
            ? ""
            : "\n") +
        "public/private-uploads/\n";

    fs.writeFileSync(
        gitignorePath,
        gitignore
    );

    console.log("✅ Private uploads protected by .gitignore.");
}

// --------------------------------------------------
// 12. Write files
// --------------------------------------------------

fs.writeFileSync(serverPath, server);
fs.writeFileSync(chatPath, chat);

console.log("");
console.log("==============================================");
console.log("✅ PRIVATE FILE SYSTEM REPAIRED");
console.log("==============================================");
console.log("");
console.log("Backups:");
console.log(`server.js.backup-private-repair-${stamp}`);
console.log(`views/chat.ejs.backup-private-repair-${stamp}`);
console.log("");
console.log("Next: run the verification commands.");
console.log("");
