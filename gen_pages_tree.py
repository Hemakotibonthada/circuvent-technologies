import sys

with open("pages_list.txt", encoding="utf-8") as f:
    lines = [l.strip() for l in f if l.strip()]

pages = []
for l in lines:
    l2 = l.replace("\\", "/")
    assert l2.startswith("src/app/")
    rest = l2[len("src/app/"):]
    if rest == "page.tsx":
        rest = "(root)"
    else:
        assert rest.endswith("/page.tsx")
        rest = rest[: -len("/page.tsx")]
    pages.append(rest)

assert len(pages) == 108, len(pages)

groups = {}
order = []
for r in pages:
    seg = r.split("/")[0]
    if seg not in groups:
        groups[seg] = []
        order.append(seg)
    sub = r[len(seg):]
    if sub.startswith("/"):
        sub = sub[1:]
    groups[seg].append(sub)

def word(n):
    return "page" if n == 1 else "pages"

out = []
total = len(pages)
out.append("src/app/                                                   108 page.tsx files")
out.append("|                                                        " + str(len(order)) + " top-level groups")

n_groups = len(order)
for gi, g in enumerate(order):
    is_last_group = gi == n_groups - 1
    conn = "`--" if is_last_group else "|--"
    subs = groups[g]
    subs_sorted = sorted(subs)
    n = len(subs)
    if g == "(root)":
        label = "page.tsx"
        pad2 = max(1, 70 - len(conn) - 1 - len(label))
        out.append(f"{conn} {label}{' ' * pad2}1 {word(1)}")
    elif n == 1 and subs[0] == "":
        label = f"{g}/page.tsx"
        pad2 = max(1, 70 - len(conn) - 1 - len(label))
        out.append(f"{conn} {label}{' ' * pad2}1 {word(1)}")
    else:
        label = f"{g}/"
        pad2 = max(1, 70 - len(conn) - 1 - len(label))
        out.append(f"{conn} {label}{' ' * pad2}{n} {word(n)}")
        cont = "    " if is_last_group else "|   "
        n_subs = len(subs_sorted)
        for si, s in enumerate(subs_sorted):
            is_last_sub = si == n_subs - 1
            sconn = "`--" if is_last_sub else "|--"
            leaf = "page.tsx" if s == "" else f"{s}/page.tsx"
            out.append(f"{cont}{sconn} {leaf}")
    if not is_last_group:
        out.append("|")

text = "\n".join(out)
text = text.replace("|--", "├──").replace("`--", "└──").replace("|   ", "│   ")
lines_out = text.split("\n")
fixed = []
for l in lines_out:
    if l == "|":
        l = "│"
    fixed.append(l)
text = "\n".join(fixed)

with open("pages_tree.txt", "w", encoding="utf-8") as f:
    f.write(text + "\n")

maxw = 0
bad = []
all_lines = text.split("\n")
for i, l in enumerate(all_lines):
    w = len(l)
    if w > maxw:
        maxw = w
    if w > 88:
        bad.append((i, w, l))

print("max width:", maxw)
print("bad lines:", len(bad))
for b in bad[:20]:
    print(b[0], b[1])
print("total lines:", len(all_lines))
leaf_count = sum(1 for l in all_lines if "page.tsx" in l)
print("leaf page.tsx mentions:", leaf_count)
print("groups:", len(order))
