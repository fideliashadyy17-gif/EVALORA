-- Attach exam-specific formula sheets to the two Version C mathematics papers
-- and open both examinations for candidate entry, matching the live Version A/B
-- MYP 4 Statistics and MYP 5 Sequences & Series examinations.
--
-- No existing paper, question, attempt or mark is modified.

begin;

update public.exams
   set status = case when status = 'draft' then 'open' else status end,
       settings = jsonb_set(
         coalesce(settings, '{}'::jsonb),
         '{formula_sheet}',
         '{"version":1,"title":"Formulas for this paper","groups":[{"title":"Averages","items":[{"latex":"\\bar{x} = \\dfrac{\\Sigma x}{n}","note":"Mean of n individual values."},{"latex":"\\bar{x} = \\dfrac{\\Sigma fx}{\\Sigma f}","note":"Estimated mean of a frequency table; x is a value or class midpoint."},{"latex":"\\text{range} = \\text{largest} - \\text{smallest}","note":"A simple measure of spread."}]},{"title":"Grouped data","items":[{"latex":"\\text{midpoint} = \\dfrac{L+U}{2}","note":"L and U are the class boundaries (not the printed limits when the data are continuous)."},{"latex":"\\text{class width} = U - L","note":"The width between the lower and upper class boundaries."},{"latex":"\\text{frequency density} = \\dfrac{\\text{frequency}}{\\text{class width}}","note":"Used for a histogram with unequal class widths."}]},{"title":"Median, quartiles and spread","items":[{"latex":"\\text{median position} = \\dfrac{n+1}{2}","note":"Position in the ordered list."},{"latex":"IQR = Q_3 - Q_1","note":"The interquartile range covers the middle 50 %."},{"latex":"\\text{lower fence} = Q_1 - 1.5\\,IQR","note":"A value below this fence is an outlier."},{"latex":"\\text{upper fence} = Q_3 + 1.5\\,IQR","note":"A value above this fence is an outlier."},{"latex":"\\sigma^2 = \\dfrac{\\Sigma (x-\\mu)^2}{N}","note":"Population variance."},{"latex":"\\sigma = \\sqrt{\\dfrac{\\Sigma (x-\\mu)^2}{N}}","note":"Population standard deviation; μ is the population mean."}]},{"title":"Cumulative frequency and coding","items":[{"latex":"\\text{median} = \\text{value at cumulative frequency } \\dfrac{N}{2}","note":"Read from a cumulative frequency curve or table."},{"latex":"Q_1 \\text{ at } \\dfrac{N}{4}, \\quad Q_3 \\text{ at } \\dfrac{3N}{4}","note":"Quartile positions on the cumulative axis."},{"latex":"y = ax + b","note":"A linear coding of every data value."},{"latex":"\\bar{y} = a\\bar{x} + b","note":"The mean follows the same coding."},{"latex":"\\sigma_y = |a|\\,\\sigma_x","note":"Adding b does not change the spread; multiplying by a scales it by |a|."}]}],"exam_id":"cd000000-0000-4000-8000-000000000002"}'::jsonb,
         true
       )
 where id = 'cd000000-0000-4000-8000-000000000002';

update public.exams
   set status = case when status = 'draft' then 'open' else status end,
       settings = jsonb_set(
         coalesce(settings, '{}'::jsonb),
         '{formula_sheet}',
         '{"version":1,"title":"Formulas for this paper","groups":[{"title":"Arithmetic sequences and series","items":[{"latex":"u_n = u_1 + (n-1)d","note":"nth term; d is the common difference."},{"latex":"S_n = \\dfrac{n}{2}(u_1 + u_n)","note":"Sum of the first n terms."},{"latex":"S_n = \\dfrac{n}{2}\\bigl(2u_1 + (n-1)d\\bigr)","note":"The same sum when the last term is not known."}]},{"title":"Geometric sequences and series","items":[{"latex":"u_n = u_1 r^{\\,n-1}","note":"nth term; r is the common ratio."},{"latex":"S_n = \\dfrac{u_1(r^n - 1)}{r - 1} \\quad (r \\ne 1)","note":"Sum of the first n terms."},{"latex":"S_n = \\dfrac{u_1(1 - r^n)}{1 - r} \\quad (r \\ne 1)","note":"The same sum written with 1 − r."}]},{"title":"Quadratic sequences","items":[{"latex":"u_n = an^2 + bn + c","note":"General quadratic term."},{"latex":"\\text{second difference} = 2a","note":"For a quadratic sequence the second differences are constant."}]},{"title":"Recursive rules and partial sums","items":[{"latex":"u_{n+1} = f(u_n)","note":"A recursive rule needs its initial term to define a unique sequence."},{"latex":"u_n = S_n - S_{n-1} \\quad (n \\ge 2)","note":"A term is the difference of consecutive partial sums."},{"latex":"\\sum_{k=1}^{n} u_k","note":"Sigma notation for u₁ + u₂ + … + u_n."},{"latex":"V_n = V_0(1 \\pm r)^n","note":"Repeated percentage growth (+) or decay (−)."}]}],"exam_id":"ce000000-0000-4000-8000-000000000002"}'::jsonb,
         true
       )
 where id = 'ce000000-0000-4000-8000-000000000002';

commit;
