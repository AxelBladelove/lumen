#include <stdio.h>

int main(void) {
    char line[1024];

    if (fgets(line, sizeof line, stdin) == NULL) {
        printf("\n");
        return 0;
    }

    /* TODO: imprime la linea leida. Si no termina en '\n',
       agrega un salto de linea al final. */

    return 0;
}
