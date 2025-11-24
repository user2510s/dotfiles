// scoring inspired by the TextMate ranker: https://github.com/textmate/textmate/blob/master/Frameworks/text/src/ranker.cc
/**
 * @param {string} query - the needle
 * @param {string} text - the haystack
 * @returns {number} - the calculated score
 */
export function score(query, text) {
	if (query === text) return 1

	const queryLength = query.length
	const textLength = text.length

	if (queryLength > textLength) return 0
	// roughly approximate score for huge arguments
	if (queryLength > 255 || textLength > 255 || queryLength * textLength > 255 * 30) {
		if (is_subset(query, text)) return queryLength / textLength
	}
	// precise matrix calculation
	return score_matrix(query, text)
}

/**
 * @param {string} query - the needle
 * @param {string} text - the haystack
 * @returns {boolean} - whether the haystack contains all of the needle, in order
 */
function is_subset(query, text) {
	const normalizedText = text.toLowerCase()
	const normalizedQuery = query.toLowerCase()
	let position = 0
	for (const character of normalizedQuery) {
		position = normalizedText.indexOf(character, position)
		if (position === -1) return false
	}
	return true
}

/** should match characters that can be considered part of a word */
const isLetterLike = /[\p{Letter}\p{Number}\p{Connector_Punctuation}]/v
/** should match uppercase letters */
const isUppercaseLetter = /\p{Uppercase_Letter}/v

/**
 * @param {string} text
 * @returns {Set<number>} - the indices of first and capital letters
 */
function capitalIndexes(text) {
	const indexes = new Set()
	let newWord = true
	for (let i = 0; i < text.length; i++) {
		const character = text.charAt(i)
		if ((newWord && isLetterLike.test(character)) || isUppercaseLetter.test(character)) {
			indexes.add(i)
		}
		newWord = !isLetterLike.test(character)
	}
	return indexes
}

/**
 * @param {string} query - the needle
 * @param {string} text - the haystack
 * @returns {number} - the calculated score
 */
function score_matrix(query, text) {
	const n = query.length
	const m = text.length
	const normalizedText = text.toLowerCase()
	const normalizedQuery = query.toLowerCase()

	const buffer = new ArrayBuffer(n * m)
	const matrix = Array.from(new Array(n), (i) => new Uint8Array(buffer, i * m, m))
	const first = new Uint8Array(n).fill(m)
	const last = new Uint8Array(n)

	const capitals = capitalIndexes(text)

	// fill matches
	for (let i = 0; i < n; i++) {
		let found = false
		let j = i === 0 ? 0 : first[i - 1] + 1
		for (; j < m; j++) {
			if (normalizedQuery[i] === normalizedText[j]) {
				matrix[i][j] = 1
				if (!found) {
					first[i] = j
				}
				last[i] = j + 1
				found = true
			}
		}
		if (!found) return 0
	}

	// restrict last matches
	for (let i = n - 1; i > 0; i--) {
		let bound = last[i] - 1
		if (bound < last[i - 1]) {
			while (matrix[i - 1][bound - 1] === 0) {
				bound--
			}
			last[i - 1] = bound
		}
	}

	// fill match lengths
	for (let i = n - 1; i > 0; i--) {
		for (let j = first[i]; j < last[i]; j++) {
			if (matrix[i][j] && matrix[i - 1][j - 1]) {
				matrix[i - 1][j - 1] = matrix[i][j] + 1
			}
		}
	}

	// greedy walk
	let capitalsTouched = 0
	let substrings = 0
	let prefixLength = 0

	let i = 0
	while (i < n) {
		let bestJIndex = 0
		let bestJLength = 0
		for (let j = first[i]; j < last[i]; j++) {
			if (matrix[i][j] && capitals.has(j)) {
				bestJIndex = j
				bestJLength = matrix[i][j]

				for (let k = j; k < j + bestJLength; k++) {
					if (capitals.has(k)) {
						capitalsTouched++
					}
				}
			} else if (bestJLength < matrix[i][j]) {
				bestJIndex = j
				bestJLength = matrix[i][j]
			}
		}

		if (i === 0) {
			prefixLength = bestJIndex
		}

		let length = 0
		let foundCapital = false
		while (length < bestJLength && !foundCapital) {
			i++
			length++
			if (i === n) break

			first[i] = Math.max(bestJIndex + length, first[i])
			if (length < bestJLength && n < 4) {
				if (capitals.has(first[i])) continue

				for (let j = first[i]; j < last[i]; j++) {
					if (matrix[i][j] && capitals.has(j)) {
						foundCapital = true
					}
				}
			}
		}

		substrings++
	}

	// calculate score
	const denom = n * (n + 1) + 1
	const subtract = n === capitalsTouched ? 1 : substrings * n + (n - capitalsTouched)
	let score = (denom - subtract) / denom
	score += (m - prefixLength) / m / (2 * denom)
	score += capitalsTouched / capitals.size / (4 * denom)
	score += n / m / (8 * denom)

	return score
}
