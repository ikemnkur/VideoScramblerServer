/**
 * @param {number} n
 * @param {number[][]} flights
 * @param {number} src
 * @param {number} dst
 * @param {number} k
 * @return {number}
 */
var findCheapestPrice = function (n, flights, src, dst, k) {


    function printMST(parent, graph) {
        console.log("Edge   Weight");
        for (let i = 1; i < n; i++)
            console.log(parent[i] + " - " + i + "   " + graph[parent[i]][i]);
    }

    function minKey(key, mstSet) {
        // Initialize min value 
        let min = Number.MAX_VALUE, min_index = -1;

        for (let v = 0; v < n; v++)
            if (!mstSet[v] && key[v] < min) {
                min = key[v];
                min_index = v;
            }

        return min_index;
    }

    function primMST(graph, n, start, end) {
        // Array to store constructed MST 
        let parent = new Array(n);

        // Key values used to pick minimum weight edge in cut 
        let key = new Array(n);

        // To represent set of vertices included in MST 
        let mstSet = new Array(n);

        // Initialize all keys as INFINITE 
        for (let i = 0; i < n; i++) {
            key[i] = Number.MAX_VALUE;
            mstSet[i] = false;
        }

        
        // Always include first vertex in MST. 
        key[0] = 0;
        parent[0] = -1; // First node is always root of MST 

        // // Start from the given start vertex
        // key[start] = 0;
        // parent[start] = -1; // Parent node is the root of reduced MST 

        // The MST will have n vertices 
        for (let count = 0; count < n - 1; count++) {
            // Pick the minimum key vertex from the set of vertices not yet included in MST 
            let u = minKey(key, mstSet);

            // Add the picked vertex to the MST Set 
            mstSet[u] = true;

            // Update key value and parent index of the adjacent vertices of the picked vertex. 
            for (let v = 0; v < n; v++) {
                // graph[u][v] is non-zero only for adjacent vertices of u 
                // mstSet[v] is false for vertices not yet included in MST 
                // Update the key only if graph[u][v] is smaller than key[v] 
                if (graph[u][v] && !mstSet[v] && graph[u][v] < key[v]) {
                    parent[v] = u;
                    key[v] = graph[u][v];
                }
            }
        }

        

        // Print the constructed MST 
        printMST(parent, graph);


        return parent
    }

    // initialize mst array
    let mst = [];

    // create adjacency matrix
    let matrix = new Array(n);
    for (let i = 0; i < n; i++) {
        matrix[i] = new Array(n).fill(0);
    }

    console.log("Adjacency Matrix:", matrix);

    // create adjacency matrix from flights
    for (let i = 0; i < flights.length; i++) {
        const flight = flights[i];
        const from = flight[0];
        const to = flight[1];
        const cost = flight[2];

        matrix[from][to] = cost;
        // matrix[to][from] = cost;

    }

    mst = primMST(matrix);

    console.log("MST:", mst);

     // Create adjacency list (directed graph)
    const graph = new Array(n).fill(0).map(() => []);
    
    for (const [from, to, price] of flights) {
        graph[from].push([to, price]);
    }
    
    // BFS approach with price tracking
    let queue = [[src, 0, 0]]; // [node, price, stops]
    let minPrice = new Array(n).fill(Infinity);
    minPrice[src] = 0;
    
    while (queue.length > 0) {
        const [node, price, stops] = queue.shift();
        
        // If we've exceeded k stops, skip
        if (stops > k) continue;
        
        // Explore neighbors
        for (const [neighbor, cost] of graph[node]) {
            const newPrice = price + cost;
            
            // Only continue if this path is cheaper
            if (newPrice < minPrice[neighbor]) {
                minPrice[neighbor] = newPrice;
                queue.push([neighbor, newPrice, stops + 1]);
            }
        }
    }
    
    return minPrice[dst] === Infinity ? -1 : minPrice[dst];


};

let flights = [[0, 1, 100], [1, 2, 100], [2, 0, 100], [1, 3, 600], [2, 3, 200]]

let n = 4;
let src = 0;
let dst = 3;
let k = 1;

findCheapestPrice(n, flights, src, dst, k);


// 