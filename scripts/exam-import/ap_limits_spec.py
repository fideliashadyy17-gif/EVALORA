# AP Calculus AB/BC — Limits Practice Exam (Student Edition, 17 pages, 50 MCQ).
# Source: "AP Calculus ABBC.pdf". Every stem and option is transcribed from the
# page images (not the text layer, which loses superscripts). Answers are NOT
# printed in the student edition: they were derived and checked by hand.
# Blocks: plain string = paragraph ($…$ inline and $$…$$ display maths);
# {"img": key} = figure or printed table cropped from the PDF page.

Q = [
 dict(n=1, lvl="easy", bc=False, blocks=[
   r"The table below gives selected values of a function $f$ that is defined for all real numbers, with $f(2)=3$.",
   {"img": "q01"},
   r"Based on the table, which of the following statements is true?"],
   opts=[r"$\lim_{x\to 2} f(x)=5$, and $f(2)=3$.", r"$\lim_{x\to 2} f(x)=3$, because $f(2)=3$.",
         r"$\lim_{x\to 2} f(x)$ does not exist, because $f(2)\neq 5$.", r"$\lim_{x\to 2} f(x)=5$, and therefore $f(2)=5$."], ans="A"),
 dict(n=2, lvl="easy", bc=False, blocks=[
   r"The graph of a function $f$ is shown in the figure. What is $\lim_{x\to 1} f(x)$?", {"img": "q02"}],
   opts=["1", "2", "4", "does not exist"], ans="D"),
 dict(n=3, lvl="medium", bc=False, blocks=[
   r"The graph of a function $g$ is shown in the figure. Which of the following statements about $x = 2$ must be true?",
   r"I. $\lim_{x\to 2} g(x)=4$", r"II. $g(2)=4$", r"III. $\lim_{x\to 2^-} g(x)=\lim_{x\to 2^+} g(x)$", {"img": "q03"}],
   opts=["I only", "I and II only", "I, II, and III", "I and III only"], ans="D"),
 dict(n=4, lvl="medium", bc=False, blocks=[
   r"The graph of a function $h$ is shown in the figure. Which of the following statements is true?", {"img": "q04"}],
   opts=[r"$\lim_{x\to 2^-} h(x)=-\infty$ and $\lim_{x\to 2^+} h(x)=\infty$", r"$\lim_{x\to 2} h(x)=\infty$",
         r"$\lim_{x\to 2} h(x)=0$", r"$\lim_{x\to 2} h(x)=-\infty$"], ans="A"),
 dict(n=5, lvl="hard", bc=False, blocks=[
   r"The table below gives values of $f(x)=\sin\left(\frac{\pi}{x}\right)$ at selected values of $x$ near $0$.", {"img": "q05"},
   r"Which of the following statements is correct?"],
   opts=[r"$\lim_{x\to 0} f(x)=0$, because $f(x)=0$ at every value of $x$ listed in the table.",
         r"$\lim_{x\to 0} f(x)$ does not exist, because on every interval that contains $x=0$, the function takes both the value $1$ and the value $-1$.",
         r"$\lim_{x\to 0} f(x)=0$, because $-1\le f(x)\le 1$ for all $x\neq 0$.",
         r"$\lim_{x\to 0} f(x)=1$, because $\sin\theta$ attains the value $1$ for arbitrarily large $\theta$."], ans="B"),
 dict(n=6, lvl="hard", bc=False, blocks=[
   r"The graph of a function $F$ is shown in the figure. Which of the following limits exist?",
   r"I. $\lim_{x\to -1} F(x)$", r"II. $\lim_{x\to 2} F(x)$", r"III. $\lim_{x\to 4} F(x)$", {"img": "q06"}],
   opts=["I only", "III only", "I and II only", "II only"], ans="D"),
 dict(n=7, lvl="hard", bc=False, blocks=[
   r"The graphs of the functions $f$ and $g$ are shown in the figure. What is $\lim_{x\to 1} f\big(g(x)\big)$?", {"img": "q07"}],
   opts=["does not exist", "1", "2", "3"], ans="D"),
 dict(n=8, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 3}\dfrac{x^2-9}{x-3}=$"],
   opts=["does not exist", "0", "1", "6"], ans="D"),
 dict(n=9, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 2}\dfrac{x^2-4}{x^2-5x+6}=$"],
   opts=["$-4$", "0", "1", "4"], ans="A"),
 dict(n=10, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 0}\dfrac{\dfrac{1}{x+3}-\dfrac{1}{3}}{x}=$"],
   opts=[r"$-\frac{1}{3}$", r"$-\frac{1}{9}$", "0", r"$\frac{1}{9}$"], ans="B"),
 dict(n=11, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 0}\dfrac{\sqrt{x+4}-2}{x}=$"],
   opts=["0", r"$\frac{1}{4}$", r"$\frac{1}{2}$", "1"], ans="B"),
 dict(n=12, lvl="medium", bc=False, blocks=[
   r"Let $f$ be the function defined by $f(x)=\begin{cases}\dfrac{2x^2-x-1}{x-1}, & x\neq 1,\\[1ex] 5, & x=1.\end{cases}$",
   r"What is $\lim_{x\to 1} f(x)$?"],
   opts=["0", "3", "5", "does not exist"], ans="B"),
 dict(n=13, lvl="medium", bc=False, blocks=[r"$\lim_{x\to -2}\dfrac{x^3+8}{x^2-4}=$"],
   opts=["$-3$", "0", "3", "12"], ans="A"),
 dict(n=14, lvl="medium", bc=False, blocks=[r"$\lim_{x\to 7}\dfrac{\sqrt{x+2}-3}{x-7}=$"],
   opts=[r"$\frac{1}{6}$", r"$\frac{1}{3}$", "3", "6"], ans="A"),
 dict(n=15, lvl="hard", bc=False, blocks=[r"$\lim_{x\to 4}\dfrac{\dfrac{1}{\sqrt{x}}-\dfrac{1}{2}}{x-4}=$"],
   opts=[r"$-\frac{1}{4}$", r"$-\frac{1}{8}$", r"$-\frac{1}{16}$", r"$\frac{1}{16}$"], ans="C"),
 dict(n=16, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 0}\dfrac{\sin 5x}{x}=$"],
   opts=["0", "1", "5", "does not exist"], ans="C"),
 dict(n=17, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 0}\dfrac{1-\cos x}{x}=$"],
   opts=["does not exist", "0", r"$\frac{1}{2}$", "1"], ans="B"),
 dict(n=18, lvl="medium", bc=False, blocks=[r"$\lim_{x\to 0}\dfrac{1-\cos x}{x^2}=$"],
   opts=["0", r"$\frac{1}{4}$", r"$\frac{1}{2}$", "1"], ans="C"),
 dict(n=19, lvl="medium", bc=False, blocks=[
   r"The displacement, in centimeters, of an oscillating bar at time $t$ seconds is modeled by",
   r"$$d(t)=\frac{\sin(3t)\,\sin(5t)}{t^2}, \qquad t\neq 0.$$",
   r"What is $\lim_{t\to 0} d(t)$?"],
   opts=["1", "3", "5", "15"], ans="D"),
 dict(n=20, lvl="medium", bc=False, blocks=[r"$\lim_{x\to 0}\dfrac{\sin 4x}{\sin 7x}=$"],
   opts=["0", r"$\frac{4}{7}$", "1", r"$\frac{7}{4}$"], ans="B"),
 dict(n=21, lvl="hard", bc=False, blocks=[
   r"A sensor records a temperature $T(x)$, in degrees Celsius, and for every $x\neq 0$ the reading satisfies",
   r"$$2-\frac{x^2}{2}\le T(x)\le 2+\frac{x^2}{2}.$$",
   r"The graphs of the three functions are shown in the figure. Which of the following statements must be true?", {"img": "q21"}],
   opts=[r"$\lim_{x\to 0} T(x)$ does not exist, because $T(x)$ oscillates between the two parabolas.",
         r"$\lim_{x\to 0} T(x)=1$",
         r"$\lim_{x\to 0} T(x)=2$ only if $T$ is continuous at $x=0$.",
         r"$\lim_{x\to 0} T(x)=2$"], ans="D"),
 dict(n=22, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 3^-}\dfrac{x-3}{|x-3|}=$"],
   opts=["$-1$", "0", "1", "does not exist"], ans="A"),
 dict(n=23, lvl="medium", bc=False, blocks=[
   r"The graph of a function $C$ gives the cost, in dollars, of parking a car for $t$ hours, where $0<t\le 4$. The graph of $C$ is shown in the figure. Which of the following statements is true?",
   {"img": "q23"}],
   opts=[r"$\lim_{t\to 1} C(t)=3$", r"$\lim_{t\to 1} C(t)=6$",
         r"$\lim_{t\to 1^-} C(t)\neq \lim_{t\to 1^+} C(t)$, so $\lim_{t\to 1} C(t)$ does not exist.",
         r"$\lim_{t\to 1} C(t)=C(1)$"], ans="C"),
 dict(n=24, lvl="medium", bc=False, blocks=[
   r"Let $k$ be a constant and let $f(x)=\begin{cases}kx+1, & x<2,\\ x^2-k, & x\ge 2.\end{cases}$",
   r"For what value of $k$ does $\lim_{x\to 2} f(x)$ exist?"],
   opts=["$-1$", r"$\frac{1}{3}$", "1", "2"], ans="C"),
 dict(n=25, lvl="hard", bc=False, blocks=[
   r"Let $f$ be the function defined by $f(x)=\dfrac{|x^2-4|}{x-2}$ for $x\neq 2$. What is $\lim_{x\to 2} f(x)$?"],
   opts=["$-4$", "0", "4", "does not exist"], ans="D"),
 dict(n=26, lvl="hard", bc=False, blocks=[
   r"The graph of $f(x)=\dfrac{|x+2|+|x-2|-4}{x}$ is shown in the figure. What is $\lim_{x\to 0} f(x)$?", {"img": "q26"}],
   opts=["$-2$", "0", "2", "does not exist"], ans="B"),
 dict(n=27, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 2^+}\dfrac{1}{x-2}=$"],
   opts=[r"$-\infty$", "0", "2", r"$\infty$"], ans="D"),
 dict(n=28, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 1^-}\dfrac{x+2}{x-1}=$"],
   opts=[r"$-\infty$", "$-3$", "3", r"$\infty$"], ans="A"),
 dict(n=29, lvl="medium", bc=False, blocks=[
   r"The graph of a function $h$ has a vertical asymptote at $x=3$, with $\lim_{x\to 3^-} h(x)=-\infty$ and $\lim_{x\to 3^+} h(x)=\infty$, as shown in the figure. Which of the following could be the rule for $h$?",
   {"img": "q29"}],
   opts=[r"$h(x)=-\dfrac{1}{(x-3)^2}$", r"$h(x)=-\dfrac{1}{x-3}$", r"$h(x)=\dfrac{1}{(x-3)^2}$", r"$h(x)=\dfrac{1}{x-3}$"], ans="D"),
 dict(n=30, lvl="medium", bc=False, blocks=[r"$\lim_{x\to \frac{\pi}{2}^-}\tan x=$"],
   opts=[r"$-\infty$", "0", "1", r"$\infty$"], ans="D"),
 dict(n=31, lvl="hard", bc=False, blocks=[
   r"The table below gives values of $f(x)=\dfrac{x-4}{\sqrt{x^2-16}}$ for values of $x$ greater than $4$.", {"img": "q31"},
   r"What is $\lim_{x\to 4^+} f(x)=?$"],
   opts=["0", "1", "4", r"$\infty$"], ans="A"),
 dict(n=32, lvl="easy", bc=False, blocks=[r"$\lim_{x\to \infty}\dfrac{3x^2-5x+2}{2x^2+7}=$"],
   opts=["0", r"$\frac{3}{2}$", r"$\frac{5}{2}$", r"$\infty$"], ans="B"),
 dict(n=33, lvl="easy", bc=False, blocks=[
   r"A company models the average cost, in dollars per unit, of producing $x$ units of a product by",
   r"$$A(x)=\frac{4800+3x}{x}, \qquad x\ge 1.$$", r"What is $\lim_{x\to \infty} A(x)$?"],
   opts=["0", "3", "4800", r"$\infty$"], ans="B"),
 dict(n=34, lvl="medium", bc=False, blocks=[
   r"Let $f(x)=\dfrac{\sqrt{4x^2+1}}{x+3}$. The graph of $f$ is shown in the figure, together with its horizontal asymptote. What is $\lim_{x\to -\infty} f(x)$?",
   {"img": "q34"}],
   opts=["$-2$", r"$-\frac{1}{2}$", r"$\frac{1}{2}$", "2"], ans="A"),
 dict(n=35, lvl="medium", bc=False, blocks=[
   r"The population of a culture of bacteria after $t$ hours is modeled by",
   r"$$P(t)=\frac{5000}{1+4e^{-0.2t}}, \qquad t\ge 0.$$",
   r"Selected values of $P(t)$ are given in the table.", {"img": "q35"},
   r"What is $\lim_{t\to\infty} P(t)$?"],
   opts=["0", "1000", "5000", r"$\infty$"], ans="C"),
 dict(n=36, lvl="medium", bc=False, blocks=[
   r"An object moves along a line. Its velocity, in meters per second, is",
   r"$$v(t)=\frac{\ln t}{\sqrt{t}}, \qquad t\ge 1.$$",
   r"The graph of $v$ is shown in the figure. What is $\lim_{t\to\infty} v(t)$?", {"img": "q36"}],
   opts=["0", "1", "$e$", r"$\infty$"], ans="A"),
 dict(n=37, lvl="hard", bc=False, blocks=[
   r"Let $k$ be a constant such that",
   r"$$\lim_{x\to\infty}\frac{kx^2+3x}{2x^2-x+1}=4.$$",
   r"What is the value of $k$?"],
   opts=["2", "4", "8", "16"], ans="C"),
 dict(n=38, lvl="hard", bc=False, blocks=[r"$\lim_{x\to\infty}\dfrac{3^x+x^{100}}{3^x-x^2}=$"],
   opts=["0", "1", "3", r"$\infty$"], ans="B"),
 dict(n=39, lvl="easy", bc=False, blocks=[r"$\lim_{x\to 0}\dfrac{e^{2x}-1}{x}=$"],
   opts=["0", r"$\frac{1}{2}$", "2", "$e^2$"], ans="C"),
 dict(n=40, lvl="medium", bc=False, blocks=[r"$\lim_{x\to 0^+} x\ln x=$"],
   opts=[r"$-\infty$", "$-1$", "0", "1"], ans="C"),
 dict(n=41, lvl="medium", bc=False, blocks=[r"$\lim_{x\to 1}\dfrac{x-1-\ln x}{(x-1)^2}=$"],
   opts=["0", r"$\frac{1}{4}$", r"$\frac{1}{2}$", "1"], ans="C"),
 dict(n=42, lvl="medium", bc=False, blocks=[
   r"In a compounding model, the value after one year of an investment of \$1 is",
   r"$$V(x)=(1+3x)^{2/x}, \qquad x>0,$$",
   r"where $x$ is a small positive parameter. What is $\lim_{x\to 0^+} V(x)$?"],
   opts=["1", "6", r"$2e^3$", "$e^6$"], ans="D"),
 dict(n=43, lvl="hard", bc=False, blocks=[r"$\lim_{x\to 0}\left(\dfrac{1}{x^2}-\dfrac{1}{\sin^2 x}\right)=$"],
   opts=[r"$-\frac{1}{2}$", r"$-\frac{1}{3}$", r"$-\frac{1}{6}$", "0"], ans="B"),
 dict(n=44, lvl="hard", bc=False, blocks=[
   r"Consider the limit $\lim_{x\to\infty}\dfrac{2x+\sin x}{x}$. Which of the following statements is true?"],
   opts=[r"The limit is $2$, and it can be justified by applying L'Hôpital's Rule once.",
         r"The limit is $2$, and L'Hôpital's Rule does not apply because $\lim_{x\to\infty}(2+\cos x)$ does not exist.",
         r"The limit does not exist, because L'Hôpital's Rule fails.",
         r"The limit is $2$, and L'Hôpital's Rule applies because the quotient has the indeterminate form $\frac{\infty}{\infty}$."], ans="B"),
 dict(n=45, lvl="easy", bc=True, blocks=[
   r"The amount of a medication, in milligrams, remaining in a patient's bloodstream $n$ hours after a dose is given by",
   r"$$D_n=120\left(\frac{5}{6}\right)^n, \qquad n=0,1,2,\ldots$$",
   r"Selected values are shown in the table.", {"img": "q45"},
   r"What is $\lim_{n\to\infty} D_n$?"],
   opts=["0", "20", "100", "120"], ans="A"),
 dict(n=46, lvl="medium", bc=True, blocks=[r"$\lim_{n\to\infty}\dfrac{(-1)^n}{n}=$"],
   opts=["does not exist", "$-1$", "0", "1"], ans="C"),
 dict(n=47, lvl="medium", bc=True, blocks=[
   r"Using the Maclaurin series for $\sin x$, $\lim_{x\to 0}\dfrac{\sin x - x}{x^3}=$"],
   opts=[r"$-\frac{1}{3}$", r"$-\frac{1}{6}$", "0", r"$\frac{1}{6}$"], ans="B"),
 dict(n=48, lvl="hard", bc=True, blocks=[r"$\lim_{x\to 0}\dfrac{1-\cos x-\dfrac{x^2}{2}}{x^4}=$"],
   opts=[r"$-\frac{1}{24}$", "0", r"$\frac{1}{24}$", r"$\frac{1}{12}$"], ans="A"),
 dict(n=49, lvl="hard", bc=True, blocks=[
   r"Let $a_n=\dfrac{3^n}{(n+2)!}$ for $n\ge 1$. What is $\lim_{n\to\infty}\dfrac{a_{n+1}}{a_n}$?"],
   opts=["0", r"$\frac{1}{3}$", "1", "3"], ans="A"),
 dict(n=50, lvl="hard", bc=True, blocks=[
   r"Let $a_n=\dfrac{2n^2+5}{4n^3-n}$ and $b_n=\dfrac{1}{n}$ for $n\ge 1$. What is $\lim_{n\to\infty}\dfrac{a_n}{b_n}$?"],
   opts=["0", r"$\frac{1}{4}$", r"$\frac{1}{2}$", "2"], ans="C"),
]

CHAPTERS = [
 (1, 7, "Limits from Graphs and Tables"),
 (8, 15, "Algebraic Evaluation of Limits"),
 (16, 21, "Special Trigonometric Limits and the Squeeze Theorem"),
 (22, 26, "Absolute Value, Piecewise Functions, and One-Sided Analysis"),
 (27, 31, "Infinite Limits and Vertical Asymptotes"),
 (32, 38, "Limits at Infinity, Horizontal Asymptotes, and Growth Rates"),
 (39, 44, "Indeterminate Forms and L'Hôpital's Rule"),
 (45, 50, "BC-Only Limit Extensions"),
]

# Figures / printed tables: key -> (question, width %)
FIGURES = {
 "q01": 60, "q02": 60, "q03": 60, "q04": 60, "q05": 60, "q06": 60, "q07": 90, "q21": 60,
 "q23": 65, "q26": 65, "q29": 60, "q31": 60, "q34": 65, "q35": 60, "q36": 65, "q45": 60,
}
