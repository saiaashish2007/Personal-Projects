import java.util.*;

public class CoinCollection {

    public static long getMaxCoins(List<List<Integer>> coins) {
        long[][] a = toTwoRows(coins);
        int n = a[0].length;

        // Suffix sums for each row, from column j to the end:
        // sum[r][j] = sum of a[r][c], weighted[r][j] = sum of c * a[r][c]
        long[][] sum = new long[2][n + 1];
        long[][] weighted = new long[2][n + 1];
        for (int r = 0; r < 2; r++) {
            for (int c = n - 1; c >= 0; c--) {
                sum[r][c] = sum[r][c + 1] + a[r][c];
                weighted[r][c] = weighted[r][c + 1] + c * a[r][c];
            }
        }

        long best = 0;
        long zigzag = 0; // coins from zig-zagging through columns 0..j-1
        for (int j = 0; j < n; j++) {
            int r = j % 2;     // row we are on when we reach column j (at time 2j)
            int o = 1 - r;     // the other row
            // Go right along row r to the end, then come back along row o to column j.
            // Row r, column c is reached at time c + j.
            // Row o, column c is reached at time 2n + j - 1 - c.
            long uTurn = weighted[r][j] + j * sum[r][j]
                       + (2L * n + j - 1) * sum[o][j] - weighted[o][j];
            best = Math.max(best, zigzag + uTurn);

            // Zig-zag through column j: row r at time 2j, row o at time 2j + 1.
            zigzag += 2L * j * a[r][j] + (2L * j + 1) * a[o][j];
        }
        return best;
    }

    // Accepts either 2 rows of n values, or n rows of 2 values.
    static long[][] toTwoRows(List<List<Integer>> coins) {
        boolean rowsFirst = coins.size() == 2;
        int n = rowsFirst ? coins.get(0).size() : coins.size();
        long[][] a = new long[2][n];
        for (int r = 0; r < 2; r++) {
            for (int c = 0; c < n; c++) {
                a[r][c] = rowsFirst ? coins.get(r).get(c) : coins.get(c).get(r);
            }
        }
        return a;
    }

    // ---------- tests ----------

    static long bestBrute;

    static long brute(long[][] a) {
        int n = a[0].length;
        bestBrute = -1;
        boolean[][] seen = new boolean[2][n];
        seen[0][0] = true;
        dfs(a, seen, 0, 0, 0, 1, 0);
        return bestBrute;
    }

    static void dfs(long[][] a, boolean[][] seen, int r, int c, int t, int visited, long total) {
        int n = a[0].length;
        if (visited == 2 * n) {
            bestBrute = Math.max(bestBrute, total);
            return;
        }
        int[][] moves = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        for (int[] m : moves) {
            int nr = r + m[0], nc = c + m[1];
            if (nr < 0 || nr > 1 || nc < 0 || nc >= n || seen[nr][nc]) continue;
            seen[nr][nc] = true;
            dfs(a, seen, nr, nc, t + 1, visited + 1, total + (long) (t + 1) * a[nr][nc]);
            seen[nr][nc] = false;
        }
    }

    static List<List<Integer>> rows(long[][] a) {
        List<List<Integer>> out = new ArrayList<>();
        for (long[] row : a) {
            List<Integer> l = new ArrayList<>();
            for (long v : row) l.add((int) v);
            out.add(l);
        }
        return out;
    }

    static List<List<Integer>> columns(long[][] a) {
        List<List<Integer>> out = new ArrayList<>();
        for (int c = 0; c < a[0].length; c++) out.add(List.of((int) a[0][c], (int) a[1][c]));
        return out;
    }

    static void check(long got, long want, String label) {
        if (got != want) throw new AssertionError(label + ": expected " + want + " got " + got);
    }

    public static void main(String[] args) {
        check(getMaxCoins(List.of(List.of(1, 4, 3, 2), List.of(2, 1, 3, 2))), 77, "example");
        check(getMaxCoins(List.of(List.of(1, 3), List.of(4, 2))), 19, "sample 0");
        check(getMaxCoins(List.of(List.of(5), List.of(7))), 7, "n = 1");
        check(getMaxCoins(List.of(List.of(1, 2), List.of(4, 1), List.of(3, 3), List.of(2, 2))), 77,
              "example given as n x 2");

        Random rnd = new Random(1);
        int count = 0;
        for (int n = 1; n <= 9; n++) {
            for (int trial = 0; trial < 300; trial++) {
                long[][] a = new long[2][n];
                int max = trial % 3 == 0 ? 3 : 100_000;
                for (int r = 0; r < 2; r++)
                    for (int c = 0; c < n; c++) a[r][c] = 1 + rnd.nextInt(max);
                long want = brute(a);
                check(getMaxCoins(rows(a)), want, "brute rows n=" + n);
                if (n != 2) check(getMaxCoins(columns(a)), want, "brute columns n=" + n);
                count++;
            }
        }

        // Largest input: n = 1e5, every coin = 1e5.
        int n = 100_000;
        long[][] big = new long[2][n];
        for (int r = 0; r < 2; r++) Arrays.fill(big[r], 100_000);
        long start = System.nanoTime();
        long got = getMaxCoins(rows(big));
        long ms = (System.nanoTime() - start) / 1_000_000;
        // Any path visits times 0..2n-1 once each, so all-equal coins give 1e5 * sum(0..2n-1).
        long want = 100_000L * ((2L * n - 1) * (2L * n) / 2);
        check(got, want, "max values");

        System.out.println("brute-force cases passed: " + count);
        System.out.println("max case = " + got + " in " + ms + " ms (int limit is " + Integer.MAX_VALUE + ")");
    }
}
