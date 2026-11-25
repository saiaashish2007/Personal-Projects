import java.util.Arrays;
import java.util.List;
import java.util.Random;

/**
 * Priority Processes.
 *
 * <p>n processes sit in a line. n is a power of two and can be as large as 1e9.
 * k of them are high priority (k &lt;= 1e5), given by 1-based index. The scheduler
 * starts with the whole line and may either run a block as one job or cut it
 * into two equal contiguous halves and schedule each half the same way. Every
 * block that can ever run is therefore a dyadic interval: length is a power of
 * two and the start is aligned to that length.
 *
 * <p>Cost of running one block of length {@code len} that contains {@code x}
 * high-priority processes:
 *
 * <ul>
 *   <li>x == 0: {@code normalTime}. The length does not matter.
 *   <li>x &gt; 0: {@code priorityTime * x * len}.
 * </ul>
 *
 * The total time is the sum of the blocks that actually run. Split blocks
 * themselves add nothing.
 *
 * <p>A block with no high-priority process is never worth cutting. Cutting it
 * replaces one charge of {@code normalTime} with two, and {@code normalTime}
 * is at least 1. So the search only enters blocks that contain one of the k
 * special indices. Each index lies in {@code log2(n)} blocks, which is at most
 * 30, so the whole search is O(k log n) blocks after an O(k log k) sort.
 *
 * <p>For a block that does contain high-priority processes the best choice is
 *
 * <pre>
 *   min(run this block, best(left half) + best(right half))
 * </pre>
 *
 * If both halves contain a high-priority process, cutting is always strictly
 * cheaper: the two halves cost at most {@code priorityTime * x * (len / 2)},
 * which is half of running the block whole. Running the block wins only when
 * one half is entirely ordinary and {@code normalTime} is large enough that
 * folding those processes into the high-priority job is cheaper than paying
 * {@code normalTime} for them.
 *
 * <p>The answer can reach about 1e11. That fits in a 64-bit {@code long} and
 * does not fit in a 32-bit {@code int}, so the return type is {@code long}
 * even though the prompt says {@code int}.
 */
public class PriorityProcesses {

    /**
     * Minimum total execution time.
     *
     * @param n total processes, a power of two in {@code [1, 1e9]}
     * @param highPriority 1-based indices of the high-priority processes
     * @param normalTime cost of a block that contains none of those processes
     * @param priorityTime factor in {@code priorityTime * x * length}
     */
    public static long getMinimumTime(
            int n, List<Integer> highPriority, int normalTime, int priorityTime) {
        int[] indices = new int[highPriority.size()];
        int size = 0;
        for (int index : highPriority) {
            indices[size++] = index;
        }
        return minimumTime(n, indices, size, normalTime, priorityTime);
    }

    /**
     * Same search over a raw index array. {@code count} is the number of
     * leading entries that are real indices; the rest of the array is ignored.
     * Duplicate indices are removed because an index identifies one process.
     */
    static long minimumTime(int n, int[] indices, int count, int normalTime, int priorityTime) {
        if (count == 0) {
            return normalTime;
        }
        int[] hp = Arrays.copyOf(indices, count);
        Arrays.sort(hp);
        int distinct = 1;
        for (int i = 1; i < hp.length; i++) {
            if (hp[i] != hp[distinct - 1]) {
                hp[distinct++] = hp[i];
            }
        }
        return best(hp, 0, distinct, 1, n, normalTime, priorityTime);
    }

    /**
     * Best cost of the aligned block {@code [left, right]} when {@code hp[lo, hi)}
     * are exactly the high-priority indices inside it. {@code hi > lo}.
     */
    private static long best(
            int[] hp, int lo, int hi, int left, int right, int normalTime, int priorityTime) {
        int highCount = hi - lo;
        long length = (long) right - left + 1;
        long runTogether = (long) priorityTime * highCount * length;
        if (length == 1) {
            return runTogether;
        }

        // End of the left half. Subtract before adding so the endpoints never overflow.
        int mid = left + (right - left) / 2;
        int split = firstAtOrAfter(hp, lo, hi, mid + 1);

        long leftCost =
                split == lo
                        ? normalTime
                        : best(hp, lo, split, left, mid, normalTime, priorityTime);
        long rightCost =
                split == hi
                        ? normalTime
                        : best(hp, split, hi, mid + 1, right, normalTime, priorityTime);
        return Math.min(runTogether, leftCost + rightCost);
    }

    /** First index in {@code hp[lo, hi)} whose value is {@code >= target}, or {@code hi}. */
    private static int firstAtOrAfter(int[] hp, int lo, int hi, int target) {
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (hp[mid] < target) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    public static void main(String[] args) throws Exception {
        if (args.length > 0 && args[0].equals("stdin")) {
            solveStdin();
            return;
        }
        runTests();
    }

    /**
     * HackerRank-style input:
     *
     * <pre>
     * n
     * k
     * high_priority[0]
     * ...
     * high_priority[k - 1]
     * normal_time
     * priority_time
     * </pre>
     */
    private static void solveStdin() throws Exception {
        java.util.Scanner in = new java.util.Scanner(System.in);
        int n = in.nextInt();
        int k = in.nextInt();
        int[] indices = new int[k];
        for (int i = 0; i < k; i++) {
            indices[i] = in.nextInt();
        }
        int normalTime = in.nextInt();
        int priorityTime = in.nextInt();
        System.out.println(minimumTime(n, indices, k, normalTime, priorityTime));
    }

    private static void runTests() {
        int passed = 0;

        // Worked example from the prompt: one high-priority process at index 1.
        // [1, 2] costs 2*1*2 = 4 and [3, 4] costs normalTime = 2.
        passed += check(time(4, new int[] {1}, 2, 2), 6, "example [1]");

        // Sample Case 0. Isolating all four processes costs 5+1+1+5 = 12.
        passed += check(time(4, new int[] {1, 4}, 1, 5), 12, "sample [1, 4]");
        passed += check(time(4, List.of(1, 4), 1, 5), 12, "sample via List");

        // Order and duplicate indices do not change the set of processes.
        passed += check(time(4, new int[] {4, 1, 1, 4}, 1, 5), 12, "unsorted duplicates");

        // A single process. It is high priority because k >= 1.
        passed += check(time(1, new int[] {1}, 9, 7), 7, "n = 1");

        // Length 2: run together costs 3*1*2 = 6, splitting costs 3+5 = 8.
        passed += check(time(2, new int[] {1}, 5, 3), 6, "absorb the normal neighbor");
        // Splitting wins: 3+1 = 4 against running together at 6.
        passed += check(time(2, new int[] {1}, 1, 3), 4, "split off a cheap normal");
        // Both processes are high priority, so the block is always cut: 3+3 = 6.
        passed += check(time(2, new int[] {1, 2}, 5, 3), 6, "two high-priority processes");

        // One high-priority process anywhere in the line has the same shape:
        // every cut leaves exactly one empty half.
        passed += check(singlePoint(8, 2, 2), 8, "closed form n=8 N=2 P=2");
        passed += check(singlePoint(8, 10, 2), 16, "closed form n=8 N=10 P=2");
        for (int position = 1; position <= 8; position++) {
            passed += check(time(8, new int[] {position}, 2, 2), 8, "single at " + position);
            passed += check(time(8, new int[] {position}, 10, 2), 16, "single expensive at " + position);
        }

        // Hand-solved mixed block. See the comment on each expected value.
        // [1]=2, [2]=2, [3, 4]=4, [5, 8]=5.
        passed += check(time(8, new int[] {1, 2, 3}, 5, 2), 13, "cluster at the front");
        // [1, 4] and [5, 8] each cost 10.
        passed += check(time(8, new int[] {3, 6}, 4, 3), 20, "two separated processes");
        // normalTime is large enough that each half of 4 is run whole, total 24.
        passed += check(time(8, new int[] {3, 6}, 100, 3), 24, "absorb whole halves");

        passed += checkAgainstBruteForce();
        passed += checkSinglePointOnLargeLine();
        passed += checkAnswerNeeds64Bits();
        passed += checkFullConstraintPerformance();

        System.out.println("All " + passed + " checks passed.");
    }

    /** One high-priority process: dp(1) = P, dp(L) = min(P*L, dp(L/2) + N). */
    private static long singlePoint(int n, int normalTime, int priorityTime) {
        long best = priorityTime;
        for (long length = 2; length <= n; length <<= 1) {
            best = Math.min((long) priorityTime * length, best + normalTime);
        }
        return best;
    }

    private static int checkAgainstBruteForce() {
        int passed = 0;
        int[] costs = {1, 2, 3, 7, 100};
        // Every non-empty subset of an 8-process line, across a grid of costs.
        for (int mask = 1; mask < (1 << 8); mask++) {
            int[] hp = indicesFromMask(mask);
            for (int normalTime : costs) {
                for (int priorityTime : costs) {
                    passed += compareBrute(8, hp, normalTime, priorityTime);
                }
            }
        }

        Random random = new Random(7);
        int[] sizes = {16, 64, 256, 1024, 1 << 16, 1 << 20};
        int[] trials = {400, 200, 80, 40, 8, 3};
        for (int s = 0; s < sizes.length; s++) {
            int n = sizes[s];
            for (int t = 0; t < trials[s]; t++) {
                int k = 1 + random.nextInt(Math.min(n, 300));
                int[] hp = new int[k];
                for (int i = 0; i < k; i++) {
                    hp[i] = 1 + random.nextInt(n);
                }
                int normalTime = 1 + random.nextInt(10_000);
                int priorityTime = 1 + random.nextInt(10_000);
                passed += compareBrute(n, hp, normalTime, priorityTime);
            }
        }
        return passed;
    }

    /** The empty half of a single-point block is the same on a line of length 2^29. */
    private static int checkSinglePointOnLargeLine() {
        int passed = 0;
        int n = 1 << 29;
        int[][] factors = {{1, 1}, {1, 10_000}, {10_000, 1}, {10_000, 10_000}, {2, 5}, {9, 4}};
        int[] positions = {1, 2, 3, n / 2, n / 2 + 1, n - 1, n};
        for (int[] factor : factors) {
            long expected = singlePoint(n, factor[0], factor[1]);
            for (int position : positions) {
                passed +=
                        check(
                                time(n, new int[] {position}, factor[0], factor[1]),
                                expected,
                                "large single point pos " + position + " N " + factor[0] + " P " + factor[1]);
            }
        }
        return passed;
    }

    /**
     * Spread 1e5 high-priority processes across the largest legal line and
     * charge the maximum factor. Isolating them costs more than 2^31 - 1, so a
     * 32-bit return value cannot pass this test.
     */
    private static int checkAnswerNeeds64Bits() {
        int n = 1 << 29;
        int k = 100_000;
        int normalTime = 10_000;
        int priorityTime = 10_000;
        int[] hp = new int[k];
        int step = n / k;
        for (int i = 0; i < k; i++) {
            hp[i] = 1 + i * step;
        }
        long answer = time(n, hp, normalTime, priorityTime);
        if (answer < (long) priorityTime * k) {
            throw new AssertionError("answer " + answer + " is below the priority lower bound");
        }
        if (answer > (long) priorityTime * k * n) {
            throw new AssertionError("answer " + answer + " exceeds running the line as one job");
        }
        if (answer <= Integer.MAX_VALUE) {
            throw new AssertionError("expected an answer above 32-bit int, got " + answer);
        }
        System.out.println("64-bit sample answer = " + answer);
        return 1;
    }

    private static int checkFullConstraintPerformance() {
        int n = 1 << 29;
        int k = 100_000;
        Random random = new Random(99);
        int[] hp = new int[k];
        for (int i = 0; i < k; i++) {
            hp[i] = 1 + random.nextInt(n);
        }
        // Warm up the JIT, then time the call a judge would actually make.
        time(n, hp, 10_000, 10_000);
        long start = System.nanoTime();
        long answer = time(n, hp, 10_000, 10_000);
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        int distinct = distinctCount(hp);
        if (answer < (long) 10_000 * distinct || answer > (long) 10_000 * distinct * n) {
            throw new AssertionError("large random answer out of bounds: " + answer);
        }
        if (elapsedMs > 1500) {
            throw new AssertionError("full-size case took " + elapsedMs + " ms");
        }
        System.out.println(
                "full-size case: k=" + distinct + " answer=" + answer + " in " + elapsedMs + " ms");
        return 1;
    }

    private static int compareBrute(int n, int[] hp, int normalTime, int priorityTime) {
        long actual = time(n, hp, normalTime, priorityTime);
        long expected = brute(prefix(n, hp), 1, n, normalTime, priorityTime);
        if (actual != expected) {
            throw new AssertionError(
                    "mismatch n="
                            + n
                            + " hp="
                            + Arrays.toString(hp)
                            + " N="
                            + normalTime
                            + " P="
                            + priorityTime
                            + " expected "
                            + expected
                            + " got "
                            + actual);
        }
        return 1;
    }

    /** Independent search that counts high-priority processes by scanning a prefix array. */
    private static long brute(int[] prefix, int left, int right, int normalTime, int priorityTime) {
        int highCount = prefix[right] - prefix[left - 1];
        long length = (long) right - left + 1;
        long runTogether = highCount == 0 ? normalTime : (long) priorityTime * highCount * length;
        if (length == 1) {
            return runTogether;
        }
        int mid = left + (right - left) / 2;
        return Math.min(
                runTogether,
                brute(prefix, left, mid, normalTime, priorityTime)
                        + brute(prefix, mid + 1, right, normalTime, priorityTime));
    }

    private static int[] prefix(int n, int[] hp) {
        int[] prefix = new int[n + 1];
        for (int index : hp) {
            if (index >= 1 && index <= n) {
                prefix[index] = 1;
            }
        }
        for (int i = 1; i <= n; i++) {
            prefix[i] += prefix[i - 1];
        }
        return prefix;
    }

    private static int[] indicesFromMask(int mask) {
        int count = Integer.bitCount(mask);
        int[] hp = new int[count];
        int size = 0;
        for (int bit = 0; bit < 31; bit++) {
            if ((mask & (1 << bit)) != 0) {
                hp[size++] = bit + 1;
            }
        }
        return hp;
    }

    private static int distinctCount(int[] hp) {
        int[] copy = Arrays.copyOf(hp, hp.length);
        Arrays.sort(copy);
        int distinct = 1;
        for (int i = 1; i < copy.length; i++) {
            if (copy[i] != copy[distinct - 1]) {
                distinct++;
            }
        }
        return distinct;
    }

    private static long time(int n, int[] hp, int normalTime, int priorityTime) {
        return minimumTime(n, hp, hp.length, normalTime, priorityTime);
    }

    private static long time(int n, List<Integer> hp, int normalTime, int priorityTime) {
        return getMinimumTime(n, hp, normalTime, priorityTime);
    }

    private static int check(long actual, long expected, String label) {
        if (actual != expected) {
            throw new AssertionError(label + ": expected " + expected + " but got " + actual);
        }
        return 1;
    }
}
